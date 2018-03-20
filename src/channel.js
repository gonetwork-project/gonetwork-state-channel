const message = require('./message');
const channelState = require('./channelState');
const util = require('ethereumjs-util');

//Transfers apply state mutations to the channel object.  Once a transfer is verified
//we apply it to the Channel
CHANNEL_STATE_CLOSED = 'closed'
CHANNEL_STATE_CLOSING = 'waiting_for_close'
CHANNEL_STATE_PENDING = 'pending'
CHANNEL_STATE_OPENED = 'opened'
CHANNEL_STATE_SETTLED = 'settled'
CHANNEL_STATE_SETTLING = 'waiting_for_settle'

SETTLE_TIMEOUT = new util.BN(100);
REVEAL_TIMEOUT = new util.BN(50);

class Channel{

  constructor(peerState,myState,channelAddress){
    this.peerState = peerState; //channelState.ChannelStateSync
    this.myState = myState;//channelState.ChannelStateSync
    this.channelAddress = channelAddress || message.EMTPY_32BYTE_BUFFER;
  }

  //the amount of funds that can be sent from -> to in the payment channel
  transferrableFromTo(from,to){
    return from.depositBalance.sub((from.transferredAmount.add(from.lockedAmount).add(from.unlockedAmount))
      .add(to.transferredAmount.add(to.unlockedAmount)));
  }




  handleRevealSecret(revealSecret){
    //TODO: we dont care where it comes from?
    //var from = null;
    // if(this.myState.address.compare(revealSecret.from)===0){
    //   from = this.myState;
    // }else if(this.peerState.address.compare(revealSecret.from)===0)
    // {
    //   from = this.peerState;
    // }
    // if(!from){throw new Error("Invalid RevealSecret: Unknown secret sent")};
    var myLock = this.myState.getLockFromSecret(revealSecret.secret);
    var peerLock = this.peerState.getLockFromSecret(revealSecret.secret);
    if(!(myLock && peerLock)){
      throw new Error("Invalid Secret: Unknown secret revealed");
    }
    if(myLock){
      this.myState.applyRevealSecret(revealSecret);
    }

    if(peerLock){
      this.peerState.applyRevealSecret(revealSecret);
    }
    return true;

  }

  handleTransfer(transfer){
    //check the direction of data flow

    if(this.myState.address.compare(message.from) ==0){
      this.handleTransferFromTo(this.myState,this.peerState,transfer);
    }else if(this.peerState.address.compare(message.from) ==0){
      this.handleTransferFromTo(this.peerState,this.myState,transfer);
    }
  }

  handleTransferFromTo(from,to,tansfer){
    if(!transfer instanceof ProofMessage){
      throw new Error("Invalid Transfer Type");
    }

    var proof = transfer.toProof();
    if(!proof.channelAddress.eq(this.channelAddress)){
      throw new Error("Invalid Channel Address");
    }

    if(!proof.nonce.eq(from.nonce.add(new util.BN(1)))){
      throw new Error("Invalid nonce: Nonce must be incremented by 1");
    }

    //Validate LocksRoot

    if(transfer instanceof message.LockedTransfer){
      var lock = transfer.lock;
      if(from.containsLock(lock)){
        throw new Error("Invalid Lock: Lock registered previously");
      }
      var mtValidate = from._computeMerkleTreeWithHashlock(lock);
      if(mtValidate.getRoot().compare(proof.hashLockRoot)!==0){
        throw new Error("Invalid LocksRoot for LockedTransfer");
      }
      //validate lock as well
      if(lock.amount.lte(new util.BN(0))){
        throw new Error("Invalid Lock: Lock amount must be greater than 0");
      }
      if(lock.expiration.lte(SETTLE_TIMEOUT)){
        throw new Error("Invalid Lock Expiration: Lock expiration must be less than SETTLE_TIMEOUT");
      }

    }else if(transfer instanceof message.SecretToProof){
      var mtValidate = from._computeMerkleTreeWithoutHashlock(transfer.lock);
      if(mtValidate.getRoot().compare(proof.hashLockRoot)!==0){
        throw new Error("Invalid LocksRoot for SecretToProof");
      }
    }else if(from.merkleTree.getRoot().compare(proof.hashLockRoot) !==0){
      throw new Error("Invalid LocksRoot for SecretToProof");
    }

    //validate transferredAmount
    if(proof.transferredAmount.lte(from.transferredAmount)){
      throw new Error("Invalid transferredAmount: must be monotonically increasing value");
    }

    if(transfer instanceof message.SecretToProof){
      var lock = from.getLockFromSecret(transfer.secret);//returns null if lock is not present
      if(!lock || (proof.transferredAmount.lt(from.transferredAmount.add(lock.amount)))){
        throw new Error("Invalid transferredAmount: SecretToProof does not provide expected lock amount");
      };
    }

    var transferrable = this.transferrableFromTo(from,to);
    if(proof.transferredAmount.gt(transferrable)){
      throw new Error("Invalid transferredAmountL Insufficient Balance");
    }

    if(transfer instanceof message.LockedTransfer){
      from.applyLockedTransfer(transfer);
    }else if(transfer instanceof message.DirectTransfer){
      from.applyDirectTransfer(transfer);
    }if(transfer instanceof message.SecretToProof){
      from.applySecretToProof(transfer);
    }
    //validate all the values of a transfer prior to applying it to the StateSync

    return true;
  }

  incrementedNonce(){
    return this.myState.nonce.add(new util.BN(1));
  }


  createLockedTransfer(msgID,hashLock,amount,expiration){
    var transferrable = this.transferrableFromTo(this.myState,this.peerState);
    if(amount.lte(new util.BN(0)) || transferrable.gt(amount)){
      throw new Error("Insufficient funds: lock amount must be less than or equal to transferrable amount");
    }
    if(expiration.gt(SETTLE_TIMEOUT)){
      throw new Error("Invalid expiration: lock expiration must be less than SETTLE_TIMEOUT");
    }

    var lock = new message.Lock({amount:amount,expiration:expiration, hashLock:hashLock})


    var lockedTransfer = new message.LockedTransfer({
      msgID:msgID,
      nonce: this.incrementedNonce(),
      channelAddress: this.channelAddress,
      transferredAmount:this.myState.transferredAmount,
      to:this.peerState.address,
      hashLockRoot:this.myState._computeMerkleTreeWithHashlock(lock).getRoot(),
      lock:lock
    });
    return lockedTransfer;
  }

  createDirectTransfer(msgID,transferredAmount){
    var transferrable = this.transferrableFromTo(this.myState, this.peerState);

    if(transferredAmount.lte(new util.BN(0)) ||
     transferredAmount.lte(this.myState.transferredAmount) ||
     transferredAmount.sub(this.myState.transferredAmount).gt(transferrable)){
      throw new Error("Insufficient funds: direct transfer cannot be completed");
    }

    var directTransfer = new message.DirectTransfer({
      msgID:msgID,
      nonce: this.incrementedNonce(),
      channelAddress: this.channelAddress,
      transferredAmount:transferredAmount,
      to:this.peerState.address,
      hashLockRoot:this.myState.merkleTree.getRoot()

    });
    return directTransfer;

  }

  createMediatedTransfer(msgID,hashLock,amount,expiration,target){
    var lockedTransfer = this.createLockedTransfer(msgID,hashLock,amount,expiration);
    var mediatedTransfer = new message.MediatedTransfer(Object.assign({target:target},lockedTransfer));
    return mediatedTransfer;
  }

  createSecretToProof(msgID,secret){
    var lock = this.myState.getLockFromSecret(secret);
    if(!lock){
      throw new Error("Invalid Secret: lock does not exist for secret");
    }
    var mt = this.myState._computeMerkleTreeWithoutHashlock(lock);
    var transferredAmount = this.myState.transferredAmount.add(lock.amount);
    var secretToProof = new message.SecretToProof({
      msgID:msgID,
      nonce:this.incrementedNonce(),
      channelAddress: this.channelAddress,
      transferredAmount:transferredAmount,
      to:this.peerState.address,
      hashLockRoot:mt.getRoot()
    })
    return secretToProof;
  }


  //TODO: respond to block-chain events

}

module.exports = {
  Channel
}

// function ChannelManager(){
//   //my address
//   this.address;
//   //set by the blockchain monitor
//   this.currentBlockNumber;
//   this.channels ={};

// }

// ChannelManager.prototype.createOrFind = function(peerAddress){
//   if(this.channels.hasOwnProperty(peerAddress) && this.channels[peerAddress].state ===CHANNEL_STATE_OPENED){
//     return this.channels[peerAddress];
//   }
//   this.channels[peerAddress] = new Channel();
// }

// function Channel()
// {
//   //the channel contract API

//   //the channel contracts address
//   this.channelAddress;
//   this.peerState = new ChannelState();
//   this.myState = new ChannelState();
//   //we can have multiple in-flight states.The lock state is a probablisitc state transition as there is no gaurantee
//   //that the lock can be fulfilled.  Thus we leverage a merkle tree.  In the mean time however, the locks in flight make
//   //up for a pending balance and thus must be deducted from the overall channels balance until confirmed
//   this.peerPendingState =[];//deep clone of peerState
//   this.pendingState = [];//deep clone of myState ordered by nonce
//   this.channelId = null;
//   this.startBlock;
//   this.closeBlock;
//   this.settleTimeout;
//   this.channelState = CHANNEL_STATE_PENDING;
// }


// //complete update
// Channel.prototype.handle = function(event, endState){
// //
// }

// Channel.prototype.handleOnChain = function(event){
//   //update the on chain state when state transitions occur
// }

// //once a target shows they have the secret, send them a balance proof so channel stays open
// Channel.prototype.lockToBalanceProof = function(hashLock) {
//   throw new Error("convertLock converts revealed lock to balance proof");
// };


// // Channel.prototype.receiveLockTransfer = function(hashlock){
// //   this.peerState.registerLock(hashLock);

// // }

// // Channel.prototype.sendLockTransfer = function(hashlock){
// //   this.myState.registerLock(hashLock);
// // }

// //once a secret is received, update from pending to revealed, request a balance proof from the from
// Channel.prototype.updateLockSecret = function(hashLock,secret){
//   throw new Error("updateLockSecret on the channel");
// }

// Channel.prototype.sendReveal = function(hashLock,secret){
//   //if channelstate.pendingLocks[hashlock].expiration < currentBlock
//   //if channelState.pendingLocks[hashlock].target === from
//   // return revealSecret(secret)
//   throw new Error("sendReveal expected target has requested unlock");
// }
// //handle syncing the current channel to the onchain parameters
// Channel.prototype.sync = function(parameters) {

// };

// //create the channel on the blockchain.  This call is asynchronous, a channel cannot be used until
// //the blockchain monitor returns true
// Channel.prototype.create = function(){
//   //we have a service injection scenario where we need functions from the blockchain monitor to return
//   //before we can proceed
// }

// //create signed close channel transction
// Channel.prototype.closeTransaction = function(){

// }


// //blockchain monitor can call this to update the state of a channel
// Channel.prototype.handleStateUpdate= function(){

// }
// //blockchain monitor will sync the deposits
// Channel.prototype.handleDeposit = function(){

// }

// //create signed deposit transaction on the contract
// Channel.prototype.deposit = function(){

// }
// //create ethereum transaction to withdraw revealed locks
// Channel.prototype.withdrawLocks = function(){

// }


// function ChannelState(options){
//   this.transfer_amount = options.transfer_amount || new util.BN(0); //BN
//   this.nonce = new util.BN(options.nonce) || new util.BN(0); //BN
//   if(!options.random_hash){
//       options.random_hash = ((generateRandomHash()).hash).toString("hex");
//   }
//   this.random_hash = options.random_hash;
//   this.sig = options.sig || null;
//   this.hashlockRoot = null;
//   //this holds a list of all locks which unlock money to you.  You want to convert this to a balance proof.
//   this.revealedLocks = [];
//   //these are the locks that you have created that your waiting to send secret for
//   //on ack of secret revealed, we remove it from pendingLocks and move it to the partner states revealed Locks
//   this.pendingLocks = [];

// }

// ChannelState.prototype.registerLock= function(lock){
//   //when a lock secret is pending
// }

// //we do not allow further transfers if there is a pending lock
// //this definitely needs rework in the future build
// //we have to wait for lock timeout to expire in order to reclaim locked amount
// //we may have it that the sum of locked amounts and transferred amount to prevent blocking payment channel with locks;
// ChannelState.prototype.isLocked = function(){
//   return this.pendingLocks.length > 0;
// }

// ChannelState.prototype.updateState = function(amount){
//   //TODO, ensure this state has been pushed somewhere or your done!
//   this.transfer_amount += amount;
//   this.nonce += 1;
//   this.random_hash = ((generateRandomHash()).hash).toString("hex");
// }

// ChannelState.prototype.updateLockState = function(lockedAmount,targetAddress){
//   this.nonce += 1;
//   this.random_hash = ((generateRandomHash()).hash).toString("hex");
//   var hs = generateRandomHash();
//   this.locks.append({hs:hs, amount:lockedAmount, targetAddress: targetAddress});

//   //calculate hashLockRoot
// }

// //return a serialized channel state object
// ChannelState.prototype.serialize = function() {
//   return JSON.stringify(this);
// };



// function BalanceProof(){};

// function AtomicSwap(){};
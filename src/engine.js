/*
* @Author: amitshah
* @Date:   2018-04-17 00:55:47
* @Last Modified by:   amitshah
* @Last Modified time: 2018-04-26 03:44:07
*/

const messageLib = require('./message');
const channelLib = require('./channel');
const channelStateLib = require('./channelState');
const stateMachineLib = require('./stateMachine/stateMachine');
const util = require('ethereumjs-util');
const events = require('events');

/** 
* GoNetworks Engine encapsualtes off chain interactions between clients and propogation onto the blockchain 
* @extends events.EventEmitter 
*/
class Engine extends events.EventEmitter {

  /**
   * Create Engine.
   * @param {Buffer} address - your ethereum address.
   * @param {Function} signatureService - the callback that requests the privatekey for signing of messages.
   * @param {BlockchainService} blockchainService - a class extending the BlockchainService interface to monitor and propogate transactions on chain.
   */
  constructor(address,signatureService,blockchainService){
    super();
   
    //dictionary of channels[peerAddress] that are pending mining
    this.pendingChannels = {};
    this.channels = {};
    //dictionary of channels[peerState.address.toString('hex')];
    this.channelByPeer = {};
    //dictionary of messages[msgID] = statemachine.*
    this.messageState = {};

    this.currentBlock = new util.BN(0);
    this.msgID = new util.BN(0);

    this.publicKey;
    this.address = address;
    this.initiatorStateMachine = stateMachineLib.InitiatorFactory();
    this.targetStateMachine = stateMachineLib.TargetFactory();
    var self = this;
    this.initiatorStateMachine.on("*",function(event,state){
      self.handleEvent(event,state);
    });
    this.targetStateMachine.on("*",function(event,state){
      self.handleEvent(event,state);
    });

    this.signature = signatureService;
    this.blockchain = blockchainService;
    //sanity check
    if(!channelLib.SETTLE_TIMEOUT.gt(channelLib.REVEAL_TIMEOUT)){
      throw new Error("SETTLE_TIMEOUT must be strictly and much larger then REVEAL_TIMEOUT");
    }
    this.currentBlock = new util.BN(0);
  }

  // todo: @Amit - onXYZ usually denotes passing a callback - I would suggest to change the name to handleMessage
  /**
     * Handle an incoming message after it has been deserialized
     * @param {message.SignedMessage} message.
     */
  onMessage(message){
    //TODO: all messages must be signed here?
    if(!message.isSigned()){
      throw new Error("Invalid Message: no signature found");
    }

    if(message instanceof messageLib.RequestSecret){
      this.onRequestSecret(message);
    }else if(message instanceof messageLib.RevealSecret){
      this.onRevealSecret(message);
    }else if(message instanceof messageLib.MediatedTransfer){
      this.onMediatedTransfer(message);
    }else if(message instanceof messageLib.DirectTransfer){
      this.onDirectTransfer(message);
    }else if(message instanceof messageLib.SecretToProof){
      this.onSecretToProof(message);
    }else{
      throw new Error("Invalid Message: uknown message received");
    }
    
    return new messageLib.Ack({msgID:message.msgID, messageHash:message.getHash(), to:message.from});
    
  }

  onRequestSecret(requestSecret){
    if(this.messageState.hasOwnProperty(requestSecret.msgID)){
      this.messageState[requestSecret.msgID].applyMessage('receiveRequestSecret',requestSecret);
    }

  }

  onRevealSecret(revealSecret){
    //handle reveal secret for all channels that have a lock created by it
    //we dont care where it came from unless we want to progress our state machine
    var errors = [];
    Object.values(this.channelByPeer).map(function (channel) {
      try{
        channel.handleRevealSecret(revealSecret);
      }catch(err){
        errors.push(err)
      }

    });
    //update all state machines that are in awaitRevealSecret state
    Object.values(this.messageState).map(function (messageState) {
      try{
        //the state machines will take care of echoing RevealSecrets
        //to channel peerStates

        messageState.applyMessage('receiveRevealSecret',revealSecret);
      }catch(err){
        errors.push(err)
      }
    });

    errors.map(function (error) {
      console.log(error);
    });
  }

  onSecretToProof(secretToProof){
    //handle reveal secret for all channels that have a lock created by it.
    //this is in the case where for some reason we get a SecretToProof before
    //a reveal secret

    //encapsulate in message.RevealSecret type of message, we dont have to sign it
    //it is not required
    var tempRevealSecret = new messageLib.RevealSecret({secret:secretToProof.secret})
    this.signature(tempRevealSecret);
    Object.values(this.channelByPeer).map(function (channel) {
      try{

        channel.handleRevealSecret(tempRevealSecret);
      }catch(err){
        console.log(err);
      }

    });

    Object.values(this.messageState).map(function (messageState) {
      try{
        //the state machines will take care of echoing RevealSecrets
        //to channel peerStates
        messageState.applyMessage('receiveRevealSecret',tempRevealSecret);
      }catch(err){
        console.log(err);
      }
    });

    if(!this.channelByPeer.hasOwnProperty(secretToProof.from.toString('hex'))){
      throw new Error("Invalid SecretToProof: unknown sender");
    }

    var channel = this.channelByPeer[secretToProof.from.toString('hex')];
    channel.handleTransfer(secretToProof,this.currentBlock);
    if(this.messageState.hasOwnProperty(secretToProof.msgID)){
      this.messageState[secretToProof.msgID].applyMessage('receiveSecretToProof',secretToProof);
    }else{
      //Something went wrong with the statemachine :(
    }


  }

  onDirectTransfer(directTransfer){
    if(!this.channelByPeer.hasOwnProperty(directTransfer.from.toString('hex'))){
      throw new Error('Invalid DirectTransfer: channel does not exist');
    }

    var channel = this.channelByPeer[directTransfer.from.toString('hex')];
    if(!channel.isOpen()){
      throw new Error('Invalid Channel State:state channel is not open');
    }

    console.log("EMIT TO UI: transferred:"+directTransfer.transferredAmount.sub(channel.peerState.transferredAmount));
    channel.handleTransfer(directTransfer,this.currentBlock);
  }

  onMediatedTransfer(mediatedTransfer){
    if(!this.channelByPeer.hasOwnProperty(mediatedTransfer.from.toString('hex'))){
      throw new Error('Invalid MediatedTransfer: channel does not exist');
    }

    var channel = this.channelByPeer[mediatedTransfer.from.toString('hex')];
    if(!channel.isOpen()){
      throw new Error('Invalid MediatedTransfer Received:state channel is not open');
    }
    //register the mediated transfer

    channel.handleTransfer(mediatedTransfer,this.currentBlock);
    if(mediatedTransfer.target.compare(this.address)===0){
      console.log("Start targetStateMachine");
      this.messageState[mediatedTransfer.msgID] = new stateMachineLib.MessageState(mediatedTransfer,this.targetStateMachine);
      this.messageState[mediatedTransfer.msgID].applyMessage('init',this.currentBlock);
    }
  }

  /**
     * Send a locked transfer to your channel partner
     * @param {Buffer} to - eth address who this message will be sent to.  Only differs from target if mediating a transfer
     * @param {Buffer} target - eth address of the target.
     * @param {BN} amount - amount to lock and send.
     * @param {BN} expiration - the absolute block number this locked transfer expires at.
     * @param {Buffer} secret - Bytes32 cryptographic secret
     * @param {Buffer} hashLock - Bytes32 keccak256(secret) value.
     */
  sendMediatedTransfer(to,target,amount,expiration,secret,hashLock){
    if(!this.channelByPeer.hasOwnProperty(to.toString('hex'))){
      throw new Error("Invalid MediatedTransfer: channel does not exist");
    }
    var channel = this.channelByPeer[to.toString('hex')];
    if(!channel.isOpen()){
      throw new Error('Invalid Channel State:state channel is not open');
    }

    //var expiration = this.currentBlock.add(channel.SETTLE_TIMEOUT);
    var msgID = this.incrementedMsgID();
    var mediatedTransferState = ({msgID:msgID,
      "lock":{
        hashLock:hashLock,
        amount:amount,
        expiration:expiration,
      },
      target:to,
      initiator:this.address,
      currentBlock:this.currentBlock,
      secret:secret,
      to:channel.peerState.address});

    this.messageState[msgID] = new stateMachineLib.MessageState(mediatedTransferState,this.initiatorStateMachine);
    this.messageState[msgID].applyMessage('init');
  }



  /**
     * Send a direct transfer to your channel partner
     * @param {Buffer} to - eth address who this message will be sent to.  Only differs from target if mediating a transfer
     * @param {Buffer} transferredAmount - the monotonically increasing amount to send.  This value is set by taking the previous transferredAmount + amount you want to transfer.
     */
  sendDirectTransfer(to,transferredAmount){
    if(!this.channelByPeer.hasOwnProperty(to.toString('hex'))){
      throw new Error("Invalid MediatedTransfer: unknown to address");
    }
    var channel = this.channelByPeer[to.toString('hex')];
    if(!channel.isOpen()){
      throw new Error('Invalid DirectTransfer:state channel is not open');
    }
    var msgID = this.incrementedMsgID();
    var directTransfer = channel.createDirectTransfer(msgID,transferredAmount);
    this.signature(directTransfer);
    this.send(directTransfer);
    channel.handleTransfer(directTransfer);
  }

  incrementedMsgID(){
    this.msgID = this.msgID.add(new util.BN(1));
    return this.msgID;
  }


  /**
     * Send message 
     * @param {message.SignedMessage} msg - a signed message type that requires transport
     * Override this function to define different transport channels and use cases
     * i.e integrate this with TELEGRAMS
     * Api and securely transfer funds between users on telegram or
     * generate qrcodes for revelSecret message
     * or implement webRTC p2p protocol for transport etc. 
     */
  send(msg){
    console.log("SENDING:"+messageLib.SERIALIZE(msg));
  }

  /*** Internal Event Handlers Triggered by state-machine workflows
  * handleEvent dispatches events generated by internal block time keeping updates of the engine
  */
  handleEvent(event, state){
    try{

      if(event.startsWith('GOT.')){
        switch(event){
          case 'GOT.sendMediatedTransfer':
            var channel = this.channelByPeer[state.to.toString('hex')];
            if(!channel.isOpen()){
              throw new Error("Channel is not open");
            }

            //msgID,hashLock,amount,expiration,target,initiator,currentBlock
            var mediatedTransfer = channel.createMediatedTransfer(state.msgID,
              state.lock.hashLock,
              state.lock.amount,
              state.lock.expiration,
              state.target,
              state.initiator,
              state.currentBlock);
            this.signature(mediatedTransfer);
            this.send(mediatedTransfer);
            channel.handleTransfer(mediatedTransfer);
            break;
          case 'GOT.sendRequestSecret':
            var channel = this.channelByPeer[state.to.toString('hex')];
            var requestSecret = new messageLib.RequestSecret({msgID:state.msgID,to:state.from,
              hashLock:state.lock.hashLock,amount:state.lock.amount});
            this.signature(requestSecret);
            this.send(requestSecret);
            break;
          case 'GOT.sendRevealSecret':
            var channel = this.channelByPeer[state.to.toString('hex')];
            //technically, this workflow only works when target == to.  In mediated transfers
            //we need to act more generally and have the state machine tell us where we should
            //send this secret (backwards and forwards maybe)
            var revealSecret = new messageLib.RevealSecret({to:state.revealTo, secret:state.secret});
            this.signature(revealSecret);
            this.send(revealSecret);
            //we dont register the secret, we wait for the echo Reveal
            break;
          case 'GOT.sendSecretToProof':
            var channel = this.channelByPeer[state.to.toString('hex')];
            //OPTIMIZE:technically we can still send sec2proof,
            //it would beneficial to our partner saving $$ for lock withdrawal
            //but for now we act in no interest of the  peer endpoint :( meanie
            if(!channel.isOpen()){
              throw new Error("Channel is not open");
            }

            var secretToProof = channel.createSecretToProof(state.msgID,state.secret);
            this.signature(secretToProof)
            channel.handleTransfer(secretToProof);
            this.send(secretToProof);
            //TODO: in the future, wait to apply secret to proof locally. We basically locked the state up now
            //It makes sense, in a sense.  With this implementation, when a lock secret is revealed and echoed back
            // the peer MUST accept a valid SecretToProof or no more new transfers can take place as the states are unsynced
            //By having the peer echo back, we dont really do much difference, the state is simplex
            
            break;
          case 'GOT.closeChannel':
            var channel = this.channelByPeer[state.from.toString('hex')];
            //TODO emit closing
            return this.closeChannel(channel.channelAddress);
            //channel.handleClose(this.currentBlock);
            break;
          case 'GOT.issueSettle':
            //TODO emit "IssueSettle to ui + channel";
            var channelAddress = state;
            console.log("CAN ISSUE SETTLE:"+channelAddress.toString('hex'));
            break;
          }
          return;
        }
      }
    catch(err){
      this.handleError(err);
    }
  }

   /*** Internal Error Handler Triggered by errors encountered by handleEvent  */
  handleError(err){
    console.error(err);
  }
   
  /*** Internal Blockchain callback functions
  * The following handlers are called by the blockchain service implementation to 
  * inform the engine of time progression via block number increments and various 
  * actions taken on the blockchain with respect to the state channel management
  */
  onBlock(block){
    if(block.lt(this.currentBlock)){
      throw new Error("Block Error: block count must be monotonically increasing");
    }

    this.currentBlock = block;
    //handleBlock by all the in-flight messages
    //timeout or take action as needed
    var self = this;
    Object.values(this.messageState).map(function (messageState) {
      try{
        console.debug("CALL HANDLE BLOCK ON MESSAGE");
        messageState.applyMessage('handleBlock',self.currentBlock);
      }catch(err){
        console.log(err);
      }
    });
    //handleBlock for each of the channels, perhaps SETTLE_TIMEOUT has passed
    Object.values(this.channels).map(function(channel){
      console.debug("CALL HANDLE BLOCK ON CHANNEL");
      var events  = channel.onBlock(self.currentBlock);
      for(var i=0; i < events.length; i++){
        self.handleEvent.apply(events[i]);
      }
    });
  }

  newChannel(peerAddress){
    //is this a blocking call?
    if(!this.pendingChannels.hasOwnProperty(peerAddress.toString('hex')) &&
     this.channelByPeer.hasOwnProperty(peerAddress.toString('hex')) 
      && this.channelByPeer[peerAddress.toString('hex')].state !== channelLib.CHANNEL_STATE_SETTLED){
      throw new Error("Invalid Channel: cannot create new channel as channel already exists with peer and is unsettled");
    }
    this.pendingChannels[peerAddress.toString('hex')] = true;
    var self = this;
    var _peerAddress = peerAddress;
    return this.blockchain.newChannel(peerAddress,channelLib.SETTLE_TIMEOUT).then(function(vals) {
      // ChannelNew(address netting_channel,address participant1,address participant2,uint settle_timeout);
      var channelAddress = vals[0];
      var addressOne = vals[1];
      var addressTwo = vals[2];
      var timeout = vals[3];
      self.onChannelNew(channelAddress,addressOne,addressTwo,timeout);
    }).catch(function (err) {
      self.onChannelNewError(_peerAddress);
    });
    
  };

  closeChannel(channelAddress){
    if(!this.channels.hasOwnProperty(channelAddress.toString('hex'))){
      throw new Error("Invalid Close: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    if(!channel.isOpen()){
      throw new Error("Invalid Close: Cannot reissue Closed");
    }

    var proof = channel.issueClose(this.currentBlock);
    var self = this;
    var _channelAddress = channelAddress;

    return this.blockchain.closeChannel(channelAddress,proof).then(function(closingAddress){
      //channelAddress,closingAddress,block
      //TODO: @Artur, only call this after the transaction is mined i.e. txMulitplexer 
      return self.onChannelClose(_channelAddress,closingAddress);
    }).catch(function(error){
      return self.onChannelCloseError(_channelAddress);
    });
  
    
  }

  transferUpdate(channelAddress){
    if(!this.channels.hasOwnProperty(channelAddress.toString('hex'))){
      throw new Error("Invalid TransferUpdate: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    if(channel.isOpen()){
      throw new Error("Invalid TransferUpdate: Cannot issue update on open channel");
    }
    var proof = channel.issueTransferUpdate(this.currentBlock);
    var self = this;
    var _channelAddress = channelAddress;
    
    return this.blockchain.updateTransfer(channelAddress, proof).then(function(nodeAddress){
      self.onTransferUpdated(nodeAddress)
    }).catch(function(err) {
      self.onTransferUpdatedError(_channelAddress);
    })
    
  }

  withdrawPeerOpenLocks(channelAddress){
    if(!this.channels.hasOwnProperty(channelAddress.toString('hex'))){
      throw new Error("Invalid Withdraw: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    if(channel.isOpen()){
      throw new Error("Invalid Withdraw: Cannot issue withdraw on open channel");
    }
    var openLockProofs = channel.issueWithdrawPeerOpenLocks(this.currentBlock);
    var withdraws = [];
    for(var i=0; i< openLockProofs.length; i++){
        var p = openLockProofs[i];
        //nonce,gasPrice,nettingChannelAddress, encodedOpenLock, merkleProof,secret)
        var _secret = p.openLock.secret;
        var _channelAddress = channelAddress;
        var self = this;
        var promise = this.blockchain.withdrawLock(channelAddress,p.encodeLock(),p.merkleProof,_secret)
        .then(function(vals){
          var secret = vals[0];
          var receiverAddress = vals[1];
           //channelAddress, secret, receiverAddress,block
           return self.onChannelSecretRevealed(_channelAddress,secret,receiverAddress)
        })
        .catch(function(err){              
           return self.onChannelSecretRevealedError(_channelAddress,_secret);
        })
        withdraws.push(promise);
    }
    return Promise.all(withdraws);
    
  }

  settleChannel(channelAddress){
    if(!this.channels.hasOwnProperty(channelAddress)){
      throw new Error("Invalid Settle: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    if(channel.isOpen()){
      throw new Error("Invalid Settle: cannot issue settle on open channel");
    }

    var _channelAddress = channelAddress;
    var self = this;
    channel.issueSettle(this.currentBlock);
    var _channelAddress = channelAddress;
    return self.blockChain.settle(_channelAddress).then(function () {
      return self.onChannelSettled(_channelAddress);
    }).catch(function(err){
      return self.onChannelSettledError(_channelAddress);
    });
  }

  depositChannel(channelAddress,amount){
    if(!this.channels.hasOwnProperty(channelAddress)){
      throw new Error("Invalid Settle: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    if(!channel.isOpen()){
      throw new Error("Invalid Deposite: cannot issue settle on open channel");
    }
    var _channelAddress = channelAddress;
    var self = this;
    return self.blockChain.depoist(_channelAddress,amount).then(function (vals) {
      //event ChannelNewBalance(address token_address, address participant, uint balance);
      var tokenAddress = vals[0];
      var nodeAddress = vals[1];
      var balance = vals[2];
      return self.onChannelNewBalance(_channelAddress,nodeAddress,balance);
    }).catch(function(err){
      return self.onChannelNewBalanceError(_channelAddress);
    });
  }

  approveChannel(channelAddress,amount){
    if(!this.channels.hasOwnProperty(channelAddress)){
      throw new Error("Invalid approve Channel: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    var _channelAddress = channel.channelAddress;
    return self.blockChain.approve(self.blockchain.tokenAddress,channel.channelAddress,amount)
    .then(function (vals) {
      //event Approval(address indexed _owner, address indexed _spender, uint256 _value);
      var owner = vals[0];
      var spender = vals[1];
      var value = vals[2];
     
      return self.onApproval(owner,spender,value);
    }).catch(function(err){
      return self.onApprovalError(_channelAddress);
    });
  }


  approveChannelManager(amount){
    return self.blockChain.approve(self.blockchain.gotokenAddress,
      self.blockchain.chanelManagerAddress,
      amount)
    .then(function (vals) {
      //event Approval(address indexed _owner, address indexed _spender, uint256 _value);
      var owner = vals[0]; 
      var spender = vals[1];
      var value = vals[2];
      return self.onApproval(owner,spender,value);
    }).catch(function(err){
      return self.onApprovalError();
    });
  }
  
  onApproval(owner,spender,value){
    return true;
  };

  onApprovalError(address){
    return true;
  }

  //handle blockchain events from blockchain service
  onChannelNew(channelAddress,addressOne,addressTwo,settleTimeout){
    var peerAddress = null;
    if(addressOne.compare(this.address)===0){
      peerAddress = addressTwo;
    }else if(addressTwo.compare(this.address)===0){
      peerAddress = addressOne;
    }else{
      //something very wrong
      throw new Error("Invalid Channel Event:unknown new channel");
    }

    
    var existingChannel = this.channelByPeer[peerAddress.toString('hex')];
    if(existingChannel && existingChannel.state !== channelLib.CHANNEL_STATE_SETTLED){
      throw new Error("Invalid Channel: cannot add new channel as it already exists");
    }

    var stateOne = new channelStateLib.ChannelState({
      address:this.address
    });

    var stateTwo = new channelStateLib.ChannelState({
        address:peerAddress
    });
    
      //constructor(peerState,myState,channelAddress,settleTimeout,revealTimeout,currentBlock){
    var channel = new channelLib.Channel(stateTwo,stateOne,channelAddress,
       this.currentBlock);
    this.channels[channel.channelAddress.toString('hex')] = channel;
    this.channelByPeer[channel.peerState.address.toString('hex')] = channel;

    if(this.pendingChannels.hasOwnProperty(peerAddress.toString('hex'))){
      delete this.pendingChannels[peerAddress.toString('hex')] ;
    }
    return true;
  }

  onChannelNewError(peerAddress){
    if(this.pendingChannels.hasOwnProperty(peerAddress.toString('hex'))){
      delete this.pendingChannels[peerAddress.toString('hex')] ;
    }
    return;
    //TODO: emit UnableToCreate Channel with Peer
  }

  onChannelNewBalance(channelAddress,address,balance){
    this.channels[channelAddress.toString('hex')].onChannelNewBalance(address,balance);
    return true;
  }

  onChannelNewBalanceError(){
    return false;
  }

  onChannelClose(channelAddress,closingAddress){

   var channel = this.channels[channelAddress.toString('hex')];
   channel.onChannelClose(closingAddress, this.currentBlock)
   if(closingAddress.compare(this.address) !==0){

    return this.transferUpdate(channelAddress)
   }
   return true;
  }

  onChannelCloseError(channelAddress,proof){
    var channel = this.channels[channelAddress.toString('hex')];
    return channel.onChannelCloseError();
  }

  onTransferUpdated(channelAddress,nodeAddress){
    return this.channels[channelAddress.toString('hex')].onTransferUpdated(nodeAddress,this.currentBlock);
  }

  onTransferUpdatedError(channelAddress){
    return this.channels[channelAddress.toString('hex')].onTransferUpdatedError();
  }

  onChannelSettled(channelAddress){
    return this.channels[channelAddress.toString('hex')].onChannelSettled(this.currentBlock);
  }
  onChannelSettledError(channelAddress){
   return this.channels[channelAddress.toString('hex')].onChannelSettledError();;
  }

  onChannelSecretRevealed(channelAddress, secret, receiverAddress){
    return this.channels[channelAddress.toString('hex')].onChannelSecretRevealed(secret,receiverAddress,this.currentBlock);
  };
  onChannelSecretRevealedError(channelAddress, secret){
    return this.channels[channelAddress.toString('hex')].onChannelSecretRevealedError(secret);
  };

  onRefund(channelAddress,receiverAddress,amount){
    return true;
  }
  

}

module.exports = {
  Engine
}



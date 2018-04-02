const messageLib = require('./message');
const channelLib = require('./channel');
const channelStateLib = require('./channelState');
const stateMachineLib = require('./stateMachine/stateMachine');
const util = require('ethereumjs-util');

class MessageState{
  constructor(state,stateMachine){
    this.state = state;//message.*
    this.stateMachine = stateMachine; //statemachine.*
  }

  applyMessage(stateChange,message){
    this.stateMachine.handle(this.state,stateChange,message);
  }

}

class Engine{

  constructor(address,signatureService,blockchainService){
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

    stateMachineLib.Initiator.on("*",this.handleEvent.bind(this));
    stateMachineLib.Target.on("*",this.handleEvent.bind(this));
    this.signature = signatureService;
    this.blockchain = blockchainService;
    //sanity check
    if(!channelLib.SETTLE_TIMEOUT.gt(channelLib.REVEAL_TIMEOUT)){
      throw new Error("SETTLE_TIMEOUT must be strictly and much larger then REVEAL_TIMEOUT");
    }

  }

  decodeMessage(jsonObj){

  }
  //message handlers
  onMessage(message){
    //TODO: all messages must be signed here?
    if(!message.isSigned()){
      throw new Error("Invalid Message: no signature found");
    }

    if(message instanceof messageLib.RequestSecret){
      this.onRequestSecret(message);
    }else if(message instanceof messageLib.RevealSecret){
      this.onRevealSecret(message);
    }else if(message instanceof messageLib.SecretToProof){
      this.onSecretToProof(message);
    }else if(message instanceof messageLib.DirectTransfer){
      this.onDirectTransfer(message);
    }else if(message instanceof messageLib.MediatedTransfer){
      this.onMediatedTransfer(message);
    }else{
      throw new Error("Invalid Message: uknown message received");
    }
  }

  onRequestSecret(requestSecret){
    if(this.messageState.hasOwnProperty(requestSecret.msgID)){
      this.messageState[requestSecret.msgID].applyMessage('receiveRequestSecret',requestSecret);
    }
  }

  onRevealSecret(revealSecret){
    //handle reveal secret for all channels that have a lock created by it
    //we dont care where it came from unless we want to progress our state machine
    map(Object.values(this.channelByPeer), function (channel) {
      try{
        channel.handleRevealSecret(revealSecret);

      }catch(err){
        console.log(err);
      }

    });
    //update all state machines that are in awaitRevealSecret state
    map(Object.values(this.messageState),function (messageState) {
      try{
        //the state machines will take care of echoing RevealSecrets
        //to channel peerStates

        messageState.applyMessage('receiveRevealSecret',revealSecret);
      }catch(err){
        console.log(err);
      }
    });

  }

  onSecretToProof(secretToProof){
    //handle reveal secret for all channels that have a lock created by it.
    //this is in the case where for some reason we get a SecretToProof before
    //a reveal secret
    map(Object.values(this.channelByPeer), function (channel) {
      try{
        //encapsulate in message.RevealSecret type of message, we dont have to sign it
        //it is not required
        var tempRevealSecret = new message.RevealSecret({secret:secretToProof.secret})
        channel.handleRevealSecret(tempRevealSecret);
      }catch(err){
        console.log(err);
      }

    });

    map(Object.values(this.messageState),function (messageState) {
      try{
        //the state machines will take care of echoing RevealSecrets
        //to channel peerStates

        messageState.applyMessage('receiveRevealSecret',revealSecret);
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
    if(mediatedTransfer.target.eq(this.address)){
      this.messageState[mediatedTransfer.msgID] = new MessageState(mediatedTransfer,stateMachine.Target);
      this.messageState[mediatedTransfer.msgID].applyMessage('init');
    }
  }

  sendMediatedTransfer(to,target,amount,expiration,secret,hashLock){
    if(!this.channelByPeer.hasOwnProperty(to.toString('hex'))){
      throw new Error("Invalid MediatedTransfer: channel does not exist");
    }
    var channel = this.channelByPeer[to.from.toString('hex')];
    if(channel.state!== channel.CHANNEL_STATE_OPEN){
      throw new Error('Invalid Channel State:state channel is not open');
    }

    var expiration = this.currentBlock.add(channel.SETTLE_TIMEOUT);
    var msgID = this.incrementedMsgID();
    //(msgID,hashLock,amount,expiration,target,initiator,currentBlock)
    var mediatedTransfer = channel.createMediatedTransfer(
      msgID,
      secretHashPair.hash,
      amount,
      expiration,
      target,
      this.address,
      this.currentBlock);

    var mediatedTransferState = new stateMachine.MediatedTransferState(Object.assign({
      secret:secret,
      hashLock:hashLock
    },mediatedTransfer));
    this.messageState[msgID] = new MessageState(mediatedTransferState,stateMachine.Initiator);
    this.messageState[msgID].applyMessage('init');

  }



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

  send(msg){
    console.log("SENDING:"+messageLib.SERIALIZE(msg));
  }

  onBlock(block){
    this.currentBlock = currentBlock;
    //handleBlock by all the in-flight messages
    //timeout or take action as needed
    map(Object.values(this.messageState),function (messageState) {
      try{
        messageState.applyMessage('handleBlock',this.currentBlock,channel.REVEAL_TIMEOUT);
      }catch(err){
        console.log(err);
      }
    });
    //handleBlock for each of the channels, perhaps SETTLE_TIMEOUT has passed
    var self = this;
    Object.values(this.channesl).map(function(channel){
      channel.handleBlock(self.currentBlock);
    });
  }

  createNewChannel(peerAddress,depositBalance){
    //is this a blocking call?
    if(this.channelByPeer.hasOwnProperty(peerAddress.toString('hex'))){
      throw new Error("Invalid Channel: cannot create new channel as channel already exists with peer");
    }
    this.blockchain(["CREATE_CHANNEL",[peerAddress,depositBalance]]);
    //we wont stop the user, but the ui can say theres a bunch of pending channels
    this.pendingChannels[peerAddress.toString('hex')] = true;
  };


  onNewChannel(channelAddress,addressOne,depositOne,addressTwo,depositTwo){
    var myDepositBalance = null;
    var peerDepositBalance = null;
    var peerAddress = null;
    //check who initiated the channel create
    if(addressOne.compare(this.address)===0){
      myDepositBalance = depositOne;
      peerDepositBalance = depositTwo;
      peerAddress = addressTwo;
    }else if(addressTwo.compare(this.address)===0){
      myDepositBalance = depositTwo;
      peerDepositBalance = depositOne;
      peerAddress = addressOne;
    }else{
      //something very wrong
      throw new Error("Invalid Channel Event:unknown new channel");
    }

    if(this.pendingChannels.hasOwnProperty(peerAddress.toString('hex'))){
      delete this.pendingChannels[peerAddress.toString('hex')];
    }

    if(this.channelByPeer.hasOwnProperty(peerAddress.toString('hex')) || this.channels.hasOwnProperty(channelAddress.toString('hex'))){
      throw new Error("Invalid Channel: cannot add new channel as it already exists");
    }



     var myState = new channelStateLib.ChannelState({depositBalance:myDepositBalance,
      address:this.address
    });

    var peerState = new channelStateLib.ChannelState({depositBalance:peerDepositBalance,
        address:peerAddress
      });

      //constructor(peerState,myState,channelAddress,settleTimeout,revealTimeout,currentBlock){
    var channel = new channelLib.Channel(peerState,myState,channelAddress,
       this.currentBlock,this.blockchain);

    this.channels[channel.channelAddress.toString('hex')] = channel;
    this.channelByPeer[channel.peerState.address.toString('hex')] = channel;
  }

  closeChannel(channelAddress){
    if(!this.channels.hasOwnProperty(channelAddress)){
      throw new Error("Invalid Close: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    if(channel.isOpen()){
      channel.handleClose(closingBlock);
    }
  }

  onClosed(channelAddress,closingBlock){
    if(!this.channels.hasOwnProperty(channelAddress)){
      throw new Error("Invalid Closed: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    channel.handleClosed(closingBlock);
  }

  settleChannel(channelAddress){
    if(!this.channels.hasOwnProperty(channelAddress)){
      throw new Error("Invalid Settled: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    channel.handleSettle(this.currentBlock);
  }

  onSettled(channelAddress){
    if(!this.channels.hasOwnProperty(channelAddress)){
      throw new Error("Invalid Settled: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    channel.handleSettled(this.currentBlock);
  }

  onLockWithdrawn(withrawLock){
    var revealSecret = new message.RevealSecret({secret:withrawLock.secret});
    //we dont need to sign this
    // this is if we are dependent on a reveal from one channel affecting another channel
    this.onRevealSecret(revealSecret);
  }

  onDeposit(channelAddress,depositBalance){
    if(!this.channels.hasOwnProperty(channelAddress)){
      throw new Error("Invalid Deposit: unknown channel");
    }

    this.blockchain(["DEPOSIT",depositBalance]);
    this.pendindDeposit[channelAddress.toString('hex')] = depositBalance;
  }

  onDeposited(channelAddress,depositAddress,depositBalance){
    this.channels[channelAddress.toString('hex')].handleDeposit(depositAddress,depositBalance);
  }

  //Internal Event Handlers Triggered by state-machine workflows
  handleEvent(event, state){
    //state: MediatedTransferState
    if(event.startsWith('GOT.')){
    var channel = this.channelByPeer[state.to.toString('hex')];
    switch(event){
      case 'GOT.sendMediatedTransfer':
        if(!channel.isOpen()){
          throw new Error("Channel is not open");
        }
        var msg = channel.createMediatedTransfer(state);
        this.signature(msg);
        this.send(msg);
        this.handleTransfer(mediatedTransfer);
        break;
      case 'GOT.sendRevealSecret':
        if(!channel.isOpen()){
          throw new Error("Channel is not open");
        }
        var msg = new message.RevealSecret({to:state.target, secret:state.secret});
        this.signature(msg);
        this.send(msg);
        break;
      case 'GOT.sendSecretToProof':
        if(!channel.isOpen()){
          throw new Error("Channel is not open");
        }
        var msg = channel.createSecretToProof({msgID:state.msgID,secret:state.secret});
        this.signature(msg)
        this.send(msg);
        break;
      case 'GOT.closeChannel':
        channel.handleClose();
        break;
      }
      return;
    }
  }

}

module.exports = {
  Engine,MessageState
}



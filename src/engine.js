const messageLib = require('./message');
const channelLib = require('./channel');
const channelStateLib = require('./channelState');
const stateMachineLib = require('./stateMachine/stateMachine');
const util = require('ethereumjs-util');
const events = require('events');

class MessageState{
  constructor(state,stateMachine){
    this.state = state;//message.*
    this.stateMachine = stateMachine; //statemachine.*
  }

  applyMessage(stateChange,message){
    this.stateMachine.handle(this.state,stateChange,message);
  }

}

class Engine {

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
    }else if(message instanceof messageLib.MediatedTransfer){
      this.onMediatedTransfer(message);
    }else if(message instanceof messageLib.DirectTransfer){
      this.onDirectTransfer(message);
    }else if(message instanceof messageLib.SecretToProof){
      this.onSecretToProof(message);
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
    var tempRevealSecret = new message.RevealSecret({secret:secretToProof.secret})
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
      this.messageState[mediatedTransfer.msgID] = new MessageState(mediatedTransfer,this.targetStateMachine);
      this.messageState[mediatedTransfer.msgID].applyMessage('init',this.currentBlock);
    }
  }

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

    this.messageState[msgID] = new MessageState(mediatedTransferState,this.initiatorStateMachine);
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
    this.currentBlock = block;
    //handleBlock by all the in-flight messages
    //timeout or take action as needed
    var self = this;
    Object.values(this.messageState).map(function (messageState) {
      try{

        messageState.applyMessage('handleBlock',self.currentBlock);
      }catch(err){
        console.log(err);
      }
    });
    //handleBlock for each of the channels, perhaps SETTLE_TIMEOUT has passed
    Object.values(this.channels).map(function(channel){
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

    var existingChannel = this.channelByPeer[peerAddress.toString('hex')];
    if(existingChannel && existingChannel.state !== channelLib.CHANNEL_STATE_SETTLED){
      throw new Error("Invalid Channel: cannot add new channel as it already exists");
    }

     var stateOne = new channelStateLib.ChannelState({depositBalance:myDepositBalance,
      address:this.address
    });

    var stateTwo = new channelStateLib.ChannelState({depositBalance:peerDepositBalance,
        address:peerAddress
      });
    console.log("CALLED ON NEW CHANNEL FROM:"+this.address.toString('hex'));
      //constructor(peerState,myState,channelAddress,settleTimeout,revealTimeout,currentBlock){
    var channel = new channelLib.Channel(stateTwo,stateOne,channelAddress,
       this.currentBlock,this.blockchain);

    this.channels[channel.channelAddress.toString('hex')] = channel;
    console.log("ADDING:"+channel.peerState.address.toString('hex'));
    this.channelByPeer[channel.peerState.address.toString('hex')] = channel;
  }

  closeChannel(channelAddress){
    if(!this.channels.hasOwnProperty(channelAddress.toString('hex'))){
      throw new Error("Invalid Close: unknown channel");
    }
    var channel = this.channels[channelAddress.toString('hex')];
    if(channel.isOpen()){
      channel.handleClose(this.currentBlock);
    }
  }

  onClosed(channelAddress,closingBlock){
    if(!this.channels.hasOwnProperty(channelAddress.toString('hex'))){
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
    try{
      if(event.startsWith('GOT.')){

        var channel = this.channelByPeer[state.to.toString('hex')];
        switch(event){
          case 'GOT.sendMediatedTransfer':
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
            var requestSecret = new message.RequestSecret({msgID:state.msgID,to:state.from,
              hashLock:state.lock.hashLock,amount:state.lock.amount});
            this.signature(requestSecret);
            this.send(requestSecret);
            break;
          case 'GOT.sendRevealSecret':
            //technically, this workflow only works when target == to.  In mediated transfers
            //we need to act more generally and have the state machine tell us where we should
            //send this secret (backwards and forwards maybe)
            var revealSecret = new message.RevealSecret({to:state.revealTo, secret:state.secret});
            this.signature(revealSecret);
            this.send(revealSecret);
            //we dont register the secret, we wait for the echo Reveal
            break;
          case 'GOT.sendSecretToProof':
            //OPTIMIZE:technically we can still send sec2proof,
            //it would beneficial to our partner saving $$ for lock withdrawal
            //but for now we act in no interest of the  peer endpoint :( meanie
            if(!channel.isOpen()){
              throw new Error("Channel is not open");
            }

            var secretToProof = channel.createSecretToProof(state.msgID,state.secret);
            this.signature(secretToProof)

            this.send(secretToProof);
            channel.handleTransfer(secretToProof);
            break;
          case 'GOT.closeChannel':
            channel.handleClose();
            break;
          }
          return;
        }
      }
    catch(err){
      this.handleError(err);
    }
  }

  handleError(err){
    console.error(err);

  }
}

module.exports = {
  Engine,MessageState
}



const message = require('message');
const channel = require('channel');
const stateMachine = require('stateMachine/stateMachine');

class MessageState{
  constructor(state,stateMachine){
    this.state = state;//message.*
    this.stateMachine = stateMachine; //statemachine.*

    //TOOD: subscribe to events genrated by statemachine
  }

  applyMessage(stateChange,message){
    this.stateMachine.handle(this.state,stateChange,message);
  }

}

class Engine{

  constructor(){
    //dictionary of channels[channelAddressString];
    this.channelByPeer = {};
    //dictionary of messages[msgID] = statemachine.*
    this.messageState = {};

    this.currentBlock;

    this.msgID = new util.BN(0);
    this.privateKey;
    this.publicKey;
    this.address;

  }


  //message handlers
  onMessage(message){
    if(message instanceof message.RequestSecret){
      this.onRequestSecret(message);
    }else if(message instanceof message.RevealSecret){
      this.onRevealSecret(message);
    }else if(message instanceof message.SecretToProof){
      this.onSecretToProof(message);
    }else if(message instanceof message.DirectTransfer){

    }else if(message instanceof message.MediatedTransfer){

    }
    throw new Error("Invalid Message: uknown message received");
  }

  onRequestSecret(requestSecret){
    if(this.messageState.hasOwnProperty(requestSecret.msgID)){
      this.messageState[requestSecret.msgID].applyMessage('receiveRequestSecret',requestSecret);
    }
  }

  onRevealSecret(revealSecret){
    //handle reveal secret for all channels that have a lock created by it
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
      catch(err){
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
        var tempRevealSecret = new message.RevealSecret({secret:secretToProof.secret})
        channel.handleRevealSecret(tempRevealSecret);
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
    }

  }

  onDirectTransfer(directTransfer){
    if(!this.channelByPeer.hasOwnProperty(directTransfer.from.toString('hex'))){
      throw new Error('Invalid DirectTransfer: unknown sender');
    }

    var channel = this.channelByPeer[directTransfer.from.toString('hex')];
    if(chanel.state!== channel.CHANNEL_STATE_OPEN){
      throw new Error('Invalid DirectTransfer: direct transfer to unopen state channel');
    }

    console.log("transferred:"+directTransfer.transferredAmount.sub(channel.peerState.transferredAmount));
    channel.handleTransfer(directTransfer,this.currentBlock);

  }

  onMediatedTransfer(mediatedTransfer){
    if(!this.channelByPeer.hasOwnProperty(mediatedTransfer.from.toString('hex'))){
      throw new Error('Invalid DirectTransfer: unknown sender');
    }

    var channel = this.channelByPeer[mediatedTransfer.from.toString('hex')];
    if(chanel.state!== channel.CHANNEL_STATE_OPEN){
      throw new Error('Invalid DirectTransfer: direct transfer to unopen state channel');
    }
    channel.handleTransfer(mediatedTransfer,this.currentBlock);
    if(mediatedTransfer.target.eq(this.address)){
      this.messageState[mediatedTransfer.msgID] = new MessageState(mediatedTransfer,stateMachine.Target);
      this.messageState[mediatedTransfer.msgID].applyMessage('init');
    }
  }

  sendMediatedTransfer(to,target,amount,expiration){
    if(!this.channelByPeer.hasOwnProperty(to.toString('hex'))){
      throw new Error("Invalid MediatedTransfer: unknown to address");
    }

    var channel = this.channelByPeer[to.toString('hex')];
    var expiration = this.currentBlock.add(SETTLE_TIMEOUT);
    var msgID = this.incrementedMsgID();
    var mediatedTransfer = channel.createMediatedTransfer();
    var secretHashPair = message.GenerateRandomSecretHashPair();
    var mediatedTransferState = stateMachine.mediatedTransferState(Object.assign(secretHashPair,mediatedTransfer));
    this.messageState[msgID] = new MessageState(mediatedTransferState,stateMachine.Initiator);
    this.messageState[msgID].applyMessage('init');

  }

  incrementedMsgID(){
    this.msgID = this.msgID.add(new util.BN(1));
    return this.msgID;
  }

  sendDirectTransfer(){

  }

  //blockchain handlers
  onBlockchainEvent(event){

  }



  //Internal Event Handlers Triggered by state-machine workflows
  handleEvent(e){

  }

}




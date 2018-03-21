const message = require('message');
const channel = require('channel');
const stateMachine = require('stateMachine/stateMachine');

class MessageState{
  constructor(msgID,state,stateMachine){
    this.msgID = msgID;
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
    //dictionary of channels[ethAddresString];
    this.channels = {};
    //dictionary of messages[msgID] = statemachine.*
    this.messageState = {};

    this.currentBlock;

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
    map(Object.values(this.channels), function (channel) {
      try{
        channel.handleRevealSecret(revealSecret);
      }catch(err){
        console.log(err);
      }

    });
    //update all state machines that are in awaitRevealSecret state
    map(Object.values(this.messageState),function (messageState) {
      try{
        messageState.applyMessage('receiveRevealSecret',revealSecret);
      catch(err){
        console.log(err);
      }
    });

  }

  onSecretToProof(secretToProof){

      //handle reveal secret for all channels that have a lock created by it
      map(Object.values(this.channels), function (channel) {
        try{
          channel.handleRevealSecret(revealSecret);
        }catch(err){
          console.log(err);
        }

      });


      if(this.channels.hasOwnProperty(secretToProof.from)){
        var channel = this.channels[secretToProof.from];
        channel.applySecretToProof(secretToProof);
        //update all state machines that are in awaitRevealSecret state

      }

      //update all state machines that are in awaitRevealSecret state
    map(Object.values(this.messageState),function (messageState) {
      try{
        messageState.applyMessage('receiveSecretToProof',secretToProof);
      catch(err){

      }
    });

  }

  onDirectTransfer(directTransfer){

  }

  onMediatedTransfer(mediatedTransfer){
    if(this.messageState.hasOwnProperty(mediatedTransfer.msgID)){
      this.messageState[mediatedTransfer.msgID] = statemachine.Initiator.handle(mediatedTransfer,'init');
    }
  }

  startMediatedTransfer(){
    var expiration = this.currentBlock.add(SETTLE_TIMEOUT);

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




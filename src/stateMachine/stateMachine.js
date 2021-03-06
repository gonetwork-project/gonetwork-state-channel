/*
* @Author: amitshah
* @Date:   2018-04-09 12:58:48
* @Last Modified by:   amitshah
* @Last Modified time: 2018-04-28 23:41:07
*/

const machina = require('machina');
const message = require('../message');
const channel = require('../channel');
const util = require('ethereumjs-util');

/** @namespace stateMachine */

/** @class encapsulate state machine transitions */
class MessageState{
  constructor(state,stateMachine){
    this.state = state;//message.*
    this.stateMachine = stateMachine; //statemachine.*
  }

  applyMessage(stateChange,message){
    this.stateMachine.handle(this.state,stateChange,message);
  }

}

/** @class Internal encapsulate mediated transfer state*/ 
class MediatedTransferState extends message.MediatedTransfer{
  constructor(options){
    super(options);
    this.secret;
    this.hash;
  }

  toRevealSecret(){

  }

}

/** @class factory handles the initiators lifecycle events for a mediated transfer.
*State changes can only occur after a mutating action has taken place in the engine.  the transitions merely emit further actions.
* @memberof stateMachine
* @returns {machina.BehavioralFsm}
* @see Engine.handleEvent*/
const InitiatorFactory = function(){ return new machina.BehavioralFsm( {

    initialize: function() {
      //a shared event emitter between all the state machines

    },

    namespace: "mediated-transfer",

    initialState: "init",

    states: {

        init:{
          _onEnter:function (state) {
          },
          //we have already "sent" and handled the transfer locally, now we await if
          //our channel partner responds
          "*":function(state){
            this.emit("GOT.sendMediatedTransfer",state);
            this.transition(state,"awaitRequestSecret")
          },
          _onExit:function () {
          }
        },
        awaitRequestSecret: {
            receiveRequestSecret: function( state, requestSecret ) {
                //we dont care if you request the secret after expiration
                //this also means we can NEVER reuse a secret

                if(state.target.compare(requestSecret.from)===0 &&
                  state.lock.hashLock.compare(requestSecret.hashLock)===0 &&
                  state.msgID.eq(requestSecret.msgID))
                {
                  //now you have to assume that money is gone
                  this.emit("GOT.sendRevealSecret",Object.assign(state,{revealTo:state.target}));
                  this.transition(state,"awaitRevealSecret");
                }

            },

        },
        awaitRevealSecret: {
            _onEnter: function(state) {

            },
            receiveRevealSecret:function(state,secretReveal){
              //we only unlock if the partner state learned the secret
              //not just anybody, channel can handle multiple reveals of the same secret
              if(secretReveal.from.compare(state.to)===0
                && state.lock.hashLock.compare(util.sha3(secretReveal.secret))===0){
                this.emit("GOT.sendSecretToProof",state);
                this.transition(state, 'completedTransfer');
              }
            },
            _onExit: function(state  ) {

            }

        },
        completedTransfer:{

        },
        failedTransfer:{

        },
        expiredTransfer:{

        }

    },

} );

}

/** @class factory handles the targets lifecycle events for a mediated transfer
* @memberof stateMachine
* @returns {machina.BehavioralFsm}
* @see Engine.handleEvent
*/
const TargetFactory = function(){ return new machina.BehavioralFsm( {

    initialize: function( ) {
        // your setup code goes here...
    },

    namespace: "mediated-transfer",

    initialState: "init",

    states: {

        init:{
          "*":function (state,transition,currentBlock) {
            //see if its safe to wait or dont request the secret
            //and let the lock expire by itself
            //we cant reject a lockedtransfer, it will put our locksroot out of sync
            //instead we require silent fails

            if(state.lock.expiration.lte(currentBlock.add(channel.REVEAL_TIMEOUT))){
              this.transition(state, "expiredTransfer");
            }else{
              console.log("Safe to process lock, lets request it:"+state.initiator.toString('hex'));
              this.emit("GOT.sendRequestSecret",state)
              //this.eventEmitter.emit('sendSecretRequest',state,currentBlock,revealTimeout);
              this.transition(state,"awaitRevealSecret");

            }


          },
          _onExit:function (state) {

          }

        },
        awaitRevealSecret: {
            _onEnter: function(state) {

            },
            receiveRevealSecret:function(state,revealSecret){
                //reveal secret can come from anywhere including the blockchain

                if(state.lock.hashLock.compare(util.sha3(revealSecret.secret))===0 &&
                  state.initiator.compare(revealSecret.from)===0){
                    //in memory "states" object on the target and initator statemachines are now synced
                    state = Object.assign(state,{secret:revealSecret.secret,revealTo:state.from});
                    //send this backwards to state.from
                    this.emit('GOT.sendRevealSecret',state);
                    this.transition(state,"awaitSecretToProof");

                }

            },
            handleBlock:function (state,currentBlock) {
              if(state.lock.expiration.lte(currentBlock.add(channel.REVEAL_TIMEOUT))){
                this.transition(state,"expiredTransfer");
              }else{
                //not expired
              }
            },
            _onExit: function(state  ) {

            }

        },
        awaitSecretToProof:{
          receiveSecretToProof:function(state,secretToProof){
            if(secretToProof.from.compare(state.from)===0){ // this shouldnt happen... the handleTransfer would have errored
              this.emit('GOT.receiveSecretToProof',state);
              this.transition(state,"completedTransfer");
            };

          },
          handleBlock:function (state,currentBlock) {
            if(state.lock.expiration.lte(currentBlock.add(channel.REVEAL_TIMEOUT))){
              this.emit('GOT.closeChannel',state);
              this.transition(state, "completedTransfer");
            }
          }
        },
        completedTransfer:{

        },
        expiredTransfer:{

        }

    },

} );
};

module.exports = {
  MessageState,InitiatorFactory,TargetFactory
}

const machina = require('machina');
const message = require('../message');

//State change can only occur after a mutating action has taken place upstream
//the transitions merely emit further actions.

//
function validSecret(state,requestSecret){

}

function validRevealSecret(state,revealSecret){

}


const Initiator = new machina.BehavioralFsm( {

    initialize: function(eventEmitter) {
      this.eventEmitter = eventEmitter;
        // your setup code goes here...
    },

    namespace: "mediated-transfer",

    initialState: "init",

    states: {

        init:{
          _onEnter:function (state) {


          },
          "*":"awaitRequestSecret",
          _onExit:function () {

          }

        },
        awaitRequestSecret: {
            receiveRequestSecret: function( state, requestSecret ) {
                //this.deferUntilTransition();

                if(state.target.compare(requestSecret.from)===0 &&
                  state.lock.hashLock.compare(requestSecret.hashLock)===0 &&
                  state.lock.amount.eq(requestSecret.amount) &&
                  state.msgID.eq(requestSecret.msgID)){
                  this.emit("sendSecretRequest",state);

                  this.transition(state,"awaitRevealSecret",requestSecret);
                }

            },

            _onExit:function (state)  {
              console.log("EXIT awaitRequestSecret");
            }

        },
        awaitRevealSecret: {
            _onEnter: function(state) {
              console.log("ENTERED awaitRevealSecret")
            },
            receiveRevealSecret:function(state,secretReveal){
              console.log("PROCESSING revealSecret")
              //we only unlock if the partner state learned the secret
              //not just anybody
              if(secretReveal.from.compare(state.to)===0
                && state.lock.hashLock.compare(secretReveal.hashLock)===0){
                console.log("createS2P(to:state.to)->sign(s2p)->channel[state.to].applySecretToProof(SP),send(S2P)");
                this.emit("createSecretToProof",state);
                this.transition(state,"completedTransfer");
              }
            },
            _onExit: function(state  ) {

            }

        },
        completedTransfer:{

        }

    },

} );



const Target = new machina.BehavioralFsm( {

    initialize: function( ) {
        // your setup code goes here...
    },

    namespace: "mediated-transfer",

    initialState: "init",

    states: {

        init:{
          //mediated transfer state is a mediated transfer along with the secret
          "*":function (state) {
            //TODO: check if the lock expiration make sense here?
            this.emit('sendSecretRequest',state);

            //BIG TODO: see if its safe to wait or dont request the secret
            //and let the lock expire by itself
            //we cant reject a lockedtransfer, it will put our locksroot out of sync
            //instead we require silent fails
            if(true || state.lock.expiration.gt(currentBlock)){
              console.log("Send RequestSecret message to initiator:"+state.initiator.toString('hex'));
              this.transition(state,"awaitRevealSecret");
            }else{
              this.transition(state, "failedTransfer");
            }


          },
          "*":"awaitRevealSecret",
          _onExit:function (state) {

          }

        },
        awaitRevealSecret: {
            _onEnter: function(state) {
              console.log("ENTERED awaitRevealSecret")
            },
            receiveRevealSecret:function(state,revealSecret){
              console.log("PROCESSING revealSecret")
              //reveal secret can come from anywhere!
              if(state.lock.hashLock.compare(revealSecret.hashLock)===0){
                this.emit('sendRevealSecret',state);
                this.transition(state,"awaitSecretToProof");
              }
            },
            _onExit: function(state  ) {

            }

        },
        awaitSecretToProof:{
          receiveSecretToProof:function(state,secretToProof){
            if(secretToProof.from.compare(state.from)===0){
              this.emit('receiveSecretToProof',state);
              this.transition(state,"completedTransfer");
            };

          }
        },
        completedTransfer:{

        },
        failedTransfer:{

        }

    },

} );

module.exports = {
  Initiator,Target
}

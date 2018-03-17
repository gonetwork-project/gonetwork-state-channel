const machina = require('machina');
const message = require('../message');


const Initiator = new machina.BehavioralFsm( {

    initialize: function() {

        // your setup code goes here...
    },

    namespace: "mediated-transfer",

    initialState: "init",

    states: {

        init:{
          _onEnter:function (state) {
            console.log("INIT ENTERED");

          },
          "*":"awaitRequestSecret",
          _onExit:function () {

          }

        },
        awaitRequestSecret: {
            receiveRequestSecret: function( state, requestSecret ) {
                //this.deferUntilTransition();

                if(state.target.compare(requestSecret.from)===0){
                  this.emit("SendSecretRequest",JSON.stringify(this.mediatedTransferState ));
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
              if(secretReveal.from.compare(state.to)===0){
                console.log("SENDING SECRETTOPROOF");
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
          _onEnter:function (state) {
            console.log("Send RequestSecret message");
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
              if(revealSecret.from.compare(state.from)===0){
                console.log("SENDING Reveal Secret Echo");
                this.transition(state,"awaitSecretToProof");
              }
            },
            _onExit: function(state  ) {

            }

        },
        awaitSecretToProof:{
          receiveSecretToProof:function(state,secretToProof){
            if(secretToProof.from.compare(state.from)===0){
              console.log("Recevied SecretToProof");
              this.transition(state,"completedTransfer");
            };

          }
        },
        completedTransfer:{

        }

    },

} );

module.exports = {
  Initiator,Target
}

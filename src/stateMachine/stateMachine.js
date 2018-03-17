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
            receiveSecretReveal:function(state,secretReveal){
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
          _onEnter:function (mediatedTransferState) {
            this.mediatedTransferState = mediatedTransferState;
          },
          "*":"awaitRevealSecret",
          _onExit:function () {
            this.emit("SendSecretRequest",JSON.stringify(this.mediatedTransferState));
          }

        },
        awaitRevealSecret: {
            _onEnter: function() {
                client.timer = setTimeout( function() {
                    this.handle(  client, "timeout" );
                }.bind( this ), 30000 );
                this.emit( "vehicles", { client: client, status: GREEN } );
            },
            timeout: "awaitRevealSecret",
            receiveRevealSecret: function( revealSecret ) {
                //at this point we have already registered the secret for ourselves
                //we should move towards appying the secret to the payment channel

                if(this.revealSecret.from.eq(this.mediatedTransferState.to)){
                  this.emit("SendRevealSecret", this.mediatedTransferState);
                  this.handle("awaitSecretToProof");
                }

            },
        },
        awaitSecretToProof:{
          receiveSecretToProof:function(secretToProof){
            if(secretToProof.from.eq(this.mediatedTransferState.from)){
              this.emit("MediatedTransferSuccess");
            };

          }
        }

    },

} );

module.exports = {
  Initiator,Target
}

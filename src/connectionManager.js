function ConnectionManager(signalServerUri){
  //websocket used for signaling
  this.websocket = new WebSocket(signalServerUri);
  var ws = this.websocket;
  var self = this;
  ws.onopen = function(e){
    console.log("Signaling Server Connection Opened");
  }
  ws.onclose = function(e){
    console.log("Signaling Server Connection Lost");
  }
  ws.onmessage = function(e){
      console.log("Websocket message received: " + e.data);
      var json = JSON.parse(e.data);
      if(json.action == "candidate"){
          if(json.to == self.me){
            self.processIce(json.data);
          }
      } else if(json.action == "offer"){
          // incoming offer
          if(!confirm("NEW CONNECTION FROM"+ json.from)){ return;};
          if(json.to == self.me){
              self.to = json.from;
              self.processOffer(json.data)
          }
      } else if(json.action == "answer"){
          // incoming answer
          if(json.to == self.me){
              self.processAnswer(json.data);
          }
      }
  }
  ws.onerror = function(e){
    console.log("Websocket error");
  }

  var config = {"iceServers":[{"url":"stun:stun.l.google.com:19302"}]};
  this.peerConnection;
  this.dataChannel;

  var PC = null;
  if (typeof mozRTCPeerConnection !== 'undefined'){
      PC = mozRTCPeerConnection;
  }else if(typeof webkitRTCPeerConnection !== 'undefined'){
      PC = webkitRTCPeerConnection;
  }else if(typeof RTCPeerConnection !== 'undefined'){
      PC = RTCPeerConnection;
  }else{
    throw("NO WEB RTC");
  }


  this.me = "amit";
  this.to;
  this.connectTo = function(id){
        this.to = id;
        this.openDataChannel();
        var self = this;
        var sdpConstraints = { offerToReceiveAudio: false,  offerToReceiveVideo: false, "iceRestart": true };
        this.peerConnection.createOffer(sdpConstraints).then(function (sdp) {
            self.peerConnection.setLocalDescription(sdp);
            self.sendNegotiation("offer", sdp);
            console.log("------ SEND OFFER ------");
        }, function (err) {
            console.log(err)
        });
    }

    this.sendDirect = function(e){
        this.dataChannel.send(Math.random());
    }

    this.getURLParameter = function(name) {
      return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null
    }


    this.openDataChannel = function(){
        var self = this;
        if(this.dataChannel && this.dataChannel.readyState=== "open"){
          debugger;
          this.dataChannel.close();
          this.peerConnection.close();
        }
        this.peerConnection = new PC();
        this.peerConnection.setConfiguration(config);
        this.peerConnection.onicecandidate = function(e){
            if (!self.peerConnection || !e || !e.candidate) return;
            var candidate = e.candidate;
            self.sendNegotiation("candidate", candidate);
        }
        debugger;
        this.dataChannel = this.peerConnection.createDataChannel("datachannel", {reliable: true});

        this.dataChannel.onopen = function(){
            console.log("------ DATACHANNEL OPENED ------")
        };
        this.dataChannel.onclose = function(){console.log("------ DC closed! ------")};
        this.dataChannel.onerror = function(){console.log("DC ERROR!!!")};

        this.peerConnection.ondatachannel = function (ev) {
            console.log('peerConnection.ondatachannel event fired.');
            ev.channel.onopen = function() {
                console.log('Data channel is open and ready to be used.');
            };
            ev.channel.onmessage = function(e){
                console.log("DC from ["+this.to+"]:" +e.data);
            }
        };
    }

    this.sendNegotiation = function(type, sdp){
        var json = { from: this.me, to: this.to, action: type, data: sdp};
        this.websocket.send(JSON.stringify(json));
        console.log("Sending ["+this.me+"] to ["+this.to+"]: " + JSON.stringify(sdp));
    }

    this.processOffer = function(offer){
        var self = this;
        this.openDataChannel();
        //you can only handle ice candidates once setRemoteDescription is set or else its a dom exception
        //https://stackoverflow.com/questions/38198751/domexception-error-processing-ice-candidate
        (async function(){
          var set = await self.peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).catch(function(e){
            console.log(e)
          });

        }());


        var sdpConstraints = {'mandatory':
            {
                'OfferToReceiveAudio': false,
                'OfferToReceiveVideo': false
            }
        };

        this.peerConnection.createAnswer(sdpConstraints).then(function (sdp) {
            return self.peerConnection.setLocalDescription(sdp).then(function() {
                self.sendNegotiation("answer", sdp);
                console.log("------ SEND ANSWER ------");
            })
        }, function(err) {
            console.log(err)
        });
        console.log("------ PROCESSED OFFER ------");

    };

    this.processAnswer = function(answer){
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("------ PROCESSED ANSWER ------");
        return true;
    };

    this.processIce = function(iceCandidate){
        this.peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate)).catch(function(e){
            debugger
            console.log(e)
        })
    }

    //we need a default peerConnection ready
    this.openDataChannel();

};

//module.exports = ConnectionManager;
const EthereumTx = require('ethereumjs-tx')
const EtherUtil = require('ethereumjs-util')
const RLP = require('rlp')
const webrtc = require('wrtc')
const DetectRTC = require('detectrtc');
const workerpool = require('workerpool');
const abi = require("ethereumjs-abi");
//const web3 = require('web3')

const privateKey = Buffer.from('e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109', 'hex')

const txParams = {
  nonce: '0x00',
  gasPrice: '0x09184e72a000',
  gasLimit: '0x2710',
  to: '0x0000000000000000000000000000000000000000',
  value: '0x00',
  data: '0x7f7465737432000000000000000000000000000000000000000000000000000000600057',
  // EIP 155 chainId - mainnet: 1, ropsten: 3
  chainId: 3
}

const tx = new EthereumTx(txParams)
tx.sign(privateKey)
const serializedTx = tx.serialize()
console.log(serializedTx.toString("hex"));

// pub     = ethJsUtil.ecrecover(msg, v, r, s);
// addrBuf = ethJsUtil.pubToAddress(pub);
// addr    = ethJsUtil.bufferToHex(addrBuf);
var address = EtherUtil.privateToAddress(privateKey);
var recoveredAddress = EtherUtil.publicToAddress(EtherUtil.ecrecover(tx.hash(false),27,tx.r,tx.s));
if(address.toString("hex") ===recoveredAddress.toString("hex")){
  alert("we recoved key from signature");
}

DetectRTC.load(function(){
  if(DetectRTC.isWebRTCSupported){
    alert("WEBRTC detected");
    var RTCPeerConnection     = webrtc.RTCPeerConnection;
    var RTCSessionDescription = webrtc.RTCSessionDescription;
    var RTCIceCandidate       = webrtc.RTCIceCandidate;

    var pc1 = new RTCPeerConnection();
    var pc2 = new RTCPeerConnection();

    pc1.onicecandidate = function(candidate) {
      if(!candidate.candidate) return;
      pc2.addIceCandidate(candidate.candidate);
    }

    pc2.onicecandidate = function(candidate) {
      if(!candidate.candidate) return;
      pc1.addIceCandidate(candidate.candidate);
    }

    function handle_error(error)
    {
      alert(error);
      throw error;
    }

    var checks = 0;
    var expected = 10;

    function create_data_channels() {
      var dc1 = pc1.createDataChannel('test');
      dc1.onopen = function() {
        console.log("pc1: data channel open");
        dc1.onmessage = function(event) {
          var data = event.data;
          console.log("dc1: received '"+data+"'");
          console.log("dc1: sending 'pong'");
          dc1.send("pong");
        }
      }

      var dc2;
      pc2.ondatachannel = function(event) {
        dc2 = event.channel;
        dc2.onopen = function() {
          console.log("pc2: data channel open");
          dc2.onmessage = function(event) {
            var data = event.data;
            console.log("dc2: received '"+data+"'");
            if(++checks == expected) {
              done();
            } else {
              console.log("dc2: sending 'ping'");
              dc2.send("ping");
            }
          }
          console.log("dc2: sending 'ping'");
          dc2.send("ping");
        };
      }

      create_offer();
    }

    function create_offer() {
      console.log('pc1: create offer');
      pc1.createOffer(set_pc1_local_description, handle_error);
    }

    function set_pc1_local_description(desc) {
      console.log('pc1: set local description');
      pc1.setLocalDescription(
        new RTCSessionDescription(desc),
        set_pc2_remote_description.bind(undefined, desc),
        handle_error
      );
    }

    function set_pc2_remote_description(desc) {
      console.log('pc2: set remote description');
      pc2.setRemoteDescription(
        new RTCSessionDescription(desc),
        create_answer,
        handle_error
      );
    }

    function create_answer() {
      console.log('pc2: create answer');
      pc2.createAnswer(
        set_pc2_local_description,
        handle_error
      );
    }

    function set_pc2_local_description(desc) {
      console.log('pc2: set local description');
      pc2.setLocalDescription(
        new RTCSessionDescription(desc),
        set_pc1_remote_description.bind(undefined, desc),
        handle_error
      );
    }

    function set_pc1_remote_description(desc) {
      console.log('pc1: set remote description');
      pc1.setRemoteDescription(
        new RTCSessionDescription(desc),
        wait,
        handle_error
      );
    }

    function wait() {
      console.log('waiting');
    }

    function run() {
      create_data_channels();
    }

    function done() {
      console.log('cleanup');
      pc1.close();
      pc2.close();
      console.log('done');
    }
    run();
  }
});

// Create the XHR object.
function createCORSRequest(method, url) {
  var xhr = new XMLHttpRequest();
  if ("withCredentials" in xhr) {
    // XHR for Chrome/Firefox/Opera/Safari.
    xhr.open(method, url, true);
  } else if (typeof XDomainRequest != "undefined") {
    // XDomainRequest for IE.
    xhr = new XDomainRequest();
    xhr.open(method, url);
  } else {
    // CORS not supported.
    xhr = null;
  }
  return xhr;
}

// Helper method to parse the title tag from the response.
function getTitle(text) {
  return text.match('<title>(.*)?</title>')[1];
}

// Make the actual CORS request.
function makeCorsRequest() {
  // This is a sample server that supports CORS.
  var url = 'http://html5rocks-cors.s3-website-us-east-1.amazonaws.com/index.html';

  var xhr = createCORSRequest('GET', url);
  if (!xhr) {
    alert('CORS not supported');
    return;
  }

  // Response handlers.
  xhr.onload = function() {
    var text = xhr.responseText;
    var title = getTitle(text);
    alert('Response from CORS request to ' + url + ': ' + title);
  };

  xhr.onerror = function() {
    alert('Woops, there was an error making the request.');
  };

  xhr.send();
}

makeCorsRequest();

//encrypting a message.  We want to encrypt the secret so only the receiver can decrypt but can pass through
//any point of the network
var sjcl = require('sjcl-all');

var data = {
    herp: "derp"
};

var curve = sjcl.ecc.curves.c384;
var temp = sjcl.ecc.elGamal.generateKeys(curve, 1);
var pub = temp.pub.get();
var sec = temp.sec.get();

var pubObj = new sjcl.ecc.elGamal.publicKey(curve, new sjcl.ecc.point(curve, sjcl.bn.prime.p384.fromBits(pub.x), sjcl.bn.prime.p384.fromBits(pub.y)));
var secObj = new sjcl.ecc.elGamal.secretKey(curve, sjcl.bn.prime.p384.fromBits(sec));

var ciphertext = sjcl.encrypt(pubObj, JSON.stringify(data));
var message = JSON.stringify({'ciphertext': ciphertext});

var cipherMessage = JSON.parse(message);
var decryptedData = sjcl.decrypt(secObj, cipherMessage.ciphertext);
alert(decryptedData);

var pool = workerpool.pool();

function add(a, b) {
  return a + b;
}

pool.exec(add, [3, 4])
    .then(function (result) {
      console.log('result', result); // outputs 7
    })
    .catch(function (err) {
      console.error(err);
    })
    .then(function () {
      pool.terminate(); // terminate all workers when done
    });



//once we send data to the blockchain with infura, we must wait for it to be mined,
//thus we must create a dictionary of deferred txReceipts, if the monitor sees any of the txReceipts
//it resolves the deferred
function defer() {
  var deferred = {
    promise: null,
    resolve: null,
    reject: null
  };

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  function getTransactionReceiptMined(txHash, interval) {
    const self = this;
    const transactionReceiptAsync = function(resolve, reject) {
        self.getTransactionReceipt(txHash, (error, receipt) => {
            if (error) {
                reject(error);
            } else if (receipt == null) {
                setTimeout(
                    () => transactionReceiptAsync(resolve, reject),
                    interval ? interval : 500);
            } else {
                resolve(receipt);
            }
        });
    };

    if (Array.isArray(txHash)) {
        return Promise.all(txHash.map(
            oneTxHash => self.getTransactionReceiptMined(oneTxHash, interval)));
    } else if (typeof txHash === "string") {
        return new Promise(transactionReceiptAsync);
    } else {
        throw new Error("Invalid Type: " + txHash);
    }
  }

  return deferred;
}

var deferTest = defer();

// Many, many lines below…
var randomBits = 256;
//paranoia defaults to 6 (range 1-10)
sjcl.random.startCollectors();
var randomBuffer = sjcl.random.randomWords(randomBits/(4*8));
var preimage = sjcl.codec.hex.fromBits(randomBuffer);
var hashLock = EtherUtil.sha3('0x'+preimage);

//for encryption consider serializing and unserializing public key from ethereum?
//https://github.com/bitwiseshiftleft/sjcl/wiki/Codecs
alert("encrypting hashlock:"+hashLock.toString("hex"));
ciphertext = sjcl.encrypt(pubObj, hashLock.toString("hex"));
message = JSON.stringify({'ciphertext': ciphertext});

//test using
//not on elgamal curve
var publicKey = EtherUtil.privateToPublic(privateKey);
// var pubKeyBytes = sjcl.codec.bytes.toBits(publicKey);
// var privateKeyElGamal = new sjcl.ecc.elGamal.secretKey(
//     sjcl.ecc.curves.k256,
//     sjcl.codec.bytes.toBits(privateKey)
// )


cipherMessage = JSON.parse(message);
decryptedData = sjcl.decrypt(secObj, cipherMessage.ciphertext);
alert(decryptedData);

deferTest.resolve();


//if we are considering using multisig, use this library : http://cryptocoinjs.com/modules/crypto/ecurve/#usage
//https://github.com/ambidextorius/flex/blob/1057f691ddb98284450033cf5b7a6dd834dc3397/src/secp256k1/src/tests.c

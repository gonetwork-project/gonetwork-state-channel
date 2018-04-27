/*
* @Author: amitshah
* @Date:   2018-04-18 19:55:20
* @Last Modified by:   amitshah
* @Last Modified time: 2018-04-25 20:03:37
*/
const stateChannel= require('../src/index.js');
const events = require('events');
const util = require("ethereumjs-util");

const message = stateChannel.message;
const channel = stateChannel.channel;

const {
  channelAddress,
  pk1, pk2, pk3, pk4,
  acct1, acct2, acct3, acct4
} = require('../config')();

class TestEventBus extends events.EventEmitter{
  constructor(){
    super();
    this.engine = {};
    this.on('send',this.onReceive);
    this.msgCount=0;
    this.byPass = false;
  }

  addEngine(engine){
    this.engine[engine.address.toString('hex')] = engine;

    var self = this;
    engine.send = function (msg) {
      console.log("SENDING:"+msg.from.toString('hex')+"->"+msg.to.toString('hex')+" of type:"+msg.classType);
      var emitter = self;
      setTimeout(function(){
        emitter.emit('beforeSending-'+emitter.msgCount,msg);
        if(!this.byPass){
          emitter.emit('send',message.SERIALIZE(msg));
        }
        emitter.emit('afterSending-'+emitter.msgCount, msg)
      }, 100);
    }

  }



  onReceive(packet){
    this.msgCount++;
    var msg = message.DESERIALIZE_AND_DECODE_MESSAGE(packet);
    this.emit('beforeReceiving-'+this.msgCount,msg);
    if(!this.byPass){
      this.engine[msg.to.toString('hex')].onMessage(msg);
    }
    this.emit('afterReceiving-'+this.msgCount,msg);

  }


}

function createEngine(address,privateKey,blockchainService){
    var e =  new stateChannel.Engine(address, function (msg) {
      console.log("SIGNING MESSAGE");
      msg.sign(privateKey)
    },blockchainService);
    return e;
}

var blockchainQueue = [];
var sendQueue = [];
var currentBlock = new util.BN(55);
var engine = createEngine(util.toBuffer(acct1),pk1);
var engine2 = createEngine(util.toBuffer(acct4),pk4);
 //SETUP AND DEPOSIT FOR ENGINES
engine.send = function  (msg) {
 sendQueue.push(message.SERIALIZE(msg));
}

engine2.send = function  (msg) {
 sendQueue.push(message.SERIALIZE(msg));
}

engine.blockchain = function (msg)  {

  blockchainQueue.push(msg);
}
engine2.blockchain = function (msg)  {
  blockchainQueue.push(msg);
}


engine.onChannelNew(channelAddress,
      util.toBuffer(acct1),
      util.toBuffer(acct4),
      channel.SETTLE_TIMEOUT);

engine2.onChannelNew(channelAddress,
      util.toBuffer(acct1),
      util.toBuffer(acct4),
      channel.SETTLE_TIMEOUT);

engine.onChannelNewBalance(channelAddress,util.toBuffer(acct1), new util.BN(27000));
engine2.onChannelNewBalance(channelAddress,util.toBuffer(acct1), new util.BN(27000));
   
//END SETUP


currentBlock = currentBlock.add(new util.BN(1));

//START  A DIRECT TRANSFER FROM ENGINE(0) to ENGINE(1)
var cl = console.log;

start = Date.now();
var transferredAmount = new util.BN(1);
for (var i=0; i < 1000; i++){
  sendQueue = [];
//to,target,amount,expiration,secret,hashLock
  var secretHashPair = message.GenerateRandomSecretHashPair();
  transferredAmount = transferredAmount.add(new util.BN(1));
  engine.sendDirectTransfer(util.toBuffer(acct4),transferredAmount);
  var directTransfer = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);


  engine2.onMessage(directTransfer);

}
sendQueue = [];

end = Date.now();

cl("Direct Transfers per SECOND per USER "+ 1000/((end - start)/1000));
start = Date.now();
console.log = function() {};
for (var i=0; i < 1000; i++){
	sendQueue = [];
//to,target,amount,expiration,secret,hashLock
	var secretHashPair = message.GenerateRandomSecretHashPair();

	engine.sendMediatedTransfer(
  util.toBuffer(acct4),
  util.toBuffer(acct4),
  new util.BN(1),
  currentBlock.add(new util.BN(stateChannel.channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
  secretHashPair.secret,
  secretHashPair.hash,
  );

	var mediatedTransfer = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);


	engine2.onMessage(mediatedTransfer);


	var requestSecret = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length - 1]);
	engine.onMessage(requestSecret);
	var revealSecretInitiator = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);

	engine2.onMessage(revealSecretInitiator);

	var revealSecretTarget = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
	console.log(revealSecretTarget);
	engine.onMessage(revealSecretTarget);


	console.log(engine2.messageState);
	console.log(sendQueue);

	 var secretToProof = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
	 engine2.onMessage(secretToProof);

}
end = Date.now();
cl("Locked Transfers per SECOND per USER "+ 1000/((end - start)/1000));


// }

// sendQueue = [];

// secretHashPair = message.GenerateRandomSecretHashPair();

// engine2.sendMediatedTransfer(
//   util.toBuffer(acct1),
//   util.toBuffer(acct1),
//   new util.BN(7),
//   currentBlock.add(new util.BN(stateChannel.channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
//   secretHashPair.secret,
//   secretHashPair.hash,
//   );


// mediatedTransfer = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);


// engine.onMessage(mediatedTransfer);


// requestSecret = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length - 1]);
// engine2.onMessage(requestSecret);
// revealSecretInitiator = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);

// engine.onMessage(revealSecretInitiator);

// revealSecretTarget = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
// engine2.onMessage(revealSecretTarget);



// secretToProof = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
//  engine.onMessage(secretToProof);



// //SEND new lock half open
// sendQueue = [];

// secretHashPair = message.GenerateRandomSecretHashPair();

// engine2.sendMediatedTransfer(
//   util.toBuffer(acct1),
//   util.toBuffer(acct1),
//   new util.BN(3),
//   currentBlock.add(new util.BN(stateChannel.channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
//   secretHashPair.secret,
//   secretHashPair.hash,
//   );


// mediatedTransfer = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);


// engine.onMessage(mediatedTransfer);


// requestSecret = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length - 1]);
// engine2.onMessage(requestSecret);
// revealSecretInitiator = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);

// engine.onMessage(revealSecretInitiator);

// sendQueue = [];

// secretHashPair = message.GenerateRandomSecretHashPair();

// engine2.sendMediatedTransfer(
//   util.toBuffer(acct1),
//   util.toBuffer(acct1),
//   new util.BN(2),
//   currentBlock.add(new util.BN(stateChannel.channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
//   secretHashPair.secret,
//   secretHashPair.hash,
//   );


// mediatedTransfer = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
// engine.onMessage(mediatedTransfer);


// requestSecret = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length - 1]);
// engine2.onMessage(requestSecret);
// revealSecretInitiator = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);

// engine.onMessage(revealSecretInitiator);

// sendQueue = [];

// secretHashPair = message.GenerateRandomSecretHashPair();

// engine2.sendMediatedTransfer(
//   util.toBuffer(acct1),
//   util.toBuffer(acct1),
//   new util.BN(2),
//   currentBlock.add(new util.BN(stateChannel.channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
//   secretHashPair.secret,
//   secretHashPair.hash,
//   );


// mediatedTransfer = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);
// engine.onMessage(mediatedTransfer);


// requestSecret = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length - 1]);
// engine2.onMessage(requestSecret);
// revealSecretInitiator = message.DESERIALIZE_AND_DECODE_MESSAGE(sendQueue[sendQueue.length -1]);

// engine.onMessage(revealSecretInitiator);


// engine2.closeChannel(channelAddress);

// engine.onClosed(channelAddress,16);
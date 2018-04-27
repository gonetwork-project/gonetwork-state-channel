/*
* @Author: amitshah
* @Date:   2018-04-18 19:55:20
* @Last Modified by:   amitshah
* @Last Modified time: 2018-04-26 03:48:58
*/
const stateChannel= require('../../src/index.js');
const events = require('events');
const util = require("ethereumjs-util");

const { 
  MQTT_URL,
  channelAddress,
  pk1, pk2, pk3, pk4,
  acct1, acct2, acct3, acct4
} = require('../config')('ropsten');

const message = stateChannel.message;
const channel = stateChannel.channel;

function createEngine(address,privateKey,blockchainService){
    var e =  new stateChannel.Engine(address, function (msg) {
      console.log("SIGNING MESSAGE");
      msg.sign(privateKey)
    },blockchainService);
    return e;
}

//#region SETUP
var engine2 = createEngine(util.toBuffer(acct1),pk1);
 
engine2.onChannelNew(channelAddress,
      util.toBuffer(acct1),
      util.toBuffer(acct4),
      channel.SETTLE_TIMEOUT);

engine2.onChannelNewBalance(channelAddress,util.toBuffer(acct1), new util.BN(27000));
//#endregion


//START  A DIRECT TRANSFER FROM ENGINE(0) to ENGINE(1)
var cl = console.log;

start = Date.now();
var transferredAmount = new util.BN(1);

var mqtt = require('mqtt')
var client2  = mqtt.connect('mqtt://test.mosquitto.org')
 
client2.on('connect', function () {
  client2.subscribe(acct1)
})

var count=0;
var totalCount = 0;
start = Date.now();
end = Date.now();
var currentBlock = new util.BN(1);

engine2.send = function(msg){
  
  client2.publish(acct4,message.SERIALIZE(msg));
  if(msg instanceof message.SecretToProof && count < 20){
    console.log(msg);
    var secretHashPair = message.GenerateRandomSecretHashPair();
    console.log("hashlock:"+secretHashPair.hash.toString('hex'));

    engine2.sendMediatedTransfer(
      util.toBuffer(acct4),
      util.toBuffer(acct4),
      new util.BN(1),
      currentBlock.add(new util.BN(stateChannel.channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
      secretHashPair.secret,
      secretHashPair.hash,
      );
    count++;
  }
}

console.log(engine2.channels[channelAddress.toString('hex')].peerState.proof);
client2.on('message', function (topic, msg) {
  // message is Buffer
  //count++;
  
  // //else if(count === 10){
  //   var proof = engine2.channels[channelAddress.toString('hex')].issueClose();
  //   console.log(proof);
    //end = Date.now();
    // cl("Direct Transfers Processed Per SECOND per USER "+ 1000/((end - start)/1000));
  //}
  //console.log(msg);


    var m = message.DESERIALIZE_AND_DECODE_MESSAGE(msg);
    engine2.onMessage(m);


  
  
});
for(var i=0; i < 1; i++){
var secretHashPair = message.GenerateRandomSecretHashPair();
console.log("hashlock:"+secretHashPair.hash.toString('hex'));

  engine2.sendMediatedTransfer(
  util.toBuffer(acct4),
  util.toBuffer(acct4),
  new util.BN(1),
  currentBlock.add(new util.BN(stateChannel.channel.REVEAL_TIMEOUT)).add(new util.BN(1)),
  secretHashPair.secret,
  secretHashPair.hash,
  );
}

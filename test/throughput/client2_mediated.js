/*
* @Author: amitshah
* @Date:   2018-04-18 19:55:20
* @Last Modified by:   amitshah
* @Last Modified time: 2018-04-26 03:41:53
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
var engine2 = createEngine(util.toBuffer(acct4),pk4);
 
engine2.onChannelNew(channelAddress,
      util.toBuffer(acct1),
      util.toBuffer(acct4),
      channel.SETTLE_TIMEOUT);

engine2.onChannelNewBalance(channelAddress,util.toBuffer(acct1), new util.BN(27000));
//#endregion SETUP


//START  A DIRECT TRANSFER FROM ENGINE(0) to ENGINE(1)
var cl = console.log;

start = Date.now();
var transferredAmount = new util.BN(1);

var mqtt = require('mqtt')
var client2  = mqtt.connect('mqtt://test.mosquitto.org')
 
client2.on('connect', function () {
  client2.subscribe(acct4)
})

var count=0;
var totalCount = 0;
start = Date.now();
end = Date.now();

engine2.send = function(msg){
  client2.publish(acct1,message.SERIALIZE(msg));
}

console.log(engine2.channels[channelAddress.toString('hex')].peerState.proof);
client2.on('message', function (topic, msg) {
  // message is Buffer
  //count++;

  if(count ==0){
    start = Date.now();
  }
  //else if(count === 999){
     //   end = Date.now();
 //    cl("Direct Transfers Processed Per SECOND per USER "+ 1000/((end - start)/1000));
 // }
  //console.log(msg);
  var m = message.DESERIALIZE_AND_DECODE_MESSAGE(msg);
  engine2.onMessage(m);
  var peerState = engine2.channels[channelAddress.toString('hex')].peerState;
  console.log(peerState);
  console.log
  
  count++;
  
});

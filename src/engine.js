const util = require('./util');

function Engine(){
  //maintain a list of locks that have been deplolyed
  //this will be moved to a channel manager after
  this.locks = [];

};

Engine.prototype.onHandle = function(msg) {
  //this function handles unpacking and creating all message types
  // body...


  //Channel Exhausted Error: Inappropriate funds, may need to resync with blockchain channel to see if further deposits were made
  //Invalid Signature Error:  Signature does not match channel partner
  //Invalid Transfer Error: General Error
};

//Messages
//Send Transfer
//Send Lock Transfer
//Request Secret (include elgamal public encryption key)
//Send Secret (encrypt secret with public encryption key)
//ACK
//ERROR("detail")
//


//Channel Object
//nonce
//Inbound Transfer
  //Pending = nonce+1
  //Finalized = nonce
//Outbound Transfer
  //Pending = nonce+1
  //Finalized = nonce(based on ACK back from user)



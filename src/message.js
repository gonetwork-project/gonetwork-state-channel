const tx = require('ethereumjs-tx')
const util = require('ethereumjs-util')
const sjcl = require('sjcl-all');
const rlp = require('rlp');
const abi = require("ethereumjs-abi");

//empty 32 byte buffer
EMPTY_32BYTE_BUFFER= Buffer.alloc(32);

//TODO: handle out of bounds values for Proof Messages
class Hashable{

}

//we need to handle buffer serialization and deserialization
function JSON_REVIVER_FUNC(k,v) {
console.log("IN REVIVER");
      if (
      v !== null            &&
      typeof v === 'object' &&
      'type' in v           &&
      v.type === 'Buffer'   &&
      'data' in v           &&
      Array.isArray(v.data)) {
        return new util.toBuffer(v.data);
      }
      return v;
}

//Messages that merely require signing extend this Base Class
class SignedMessage{


  constructor(options){
    this.signature = null;
  }
  //pack this object for signing
  getHash(){
    throw Error("unimplemented pack()");
  }

  sign(privateKey){

    //Geth and thus web3 prepends the string \x19Ethereum Signed Message:\n<length of message>
    //to all data before signing it (https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_sign).
    //If you want to verify such a signature from Solidity from web3/geth, you'll have to prepend
    //the same string in solidity before doing the ecrecovery.
    var buffer = this.getHash();
    console.log("SIGNING buffer:"+ buffer.toString('hex'));
    this.signature = util.ecsign(buffer,privateKey);
  }

  recoverAddress(){
     var buffer = this.getHash();
     var pk = util.ecrecover(buffer,this.signature.v,util.toBuffer(this.signature.r),util.toBuffer(this.signature.s));
     var address = util.pubToAddress(pk);
     return address;
  }

}

//Messages that encapsulate an on chain proof extend ProofMessage base class
//A proof message maybe submitted onchain during settlement to allocate your funds

class ProofMessage extends SignedMessage{
  constructor(options){
    super(options);
    this.nonce = options.nonce || new util.BN(0);
    this.transferredAmount = options.transferredAmount || new util.BN(0);
    this.locksRoot = options.locksRoot || EMPTY_32BYTE_BUFFER;
    this.channelAddress = options.channelAddress || null;
    this.messageHash = options.messageHash || EMPTY_32BYTE_BUFFER;
    this.signature = options.signature || null;

  }

  getHash(){
    var solidityHash = abi.soliditySHA3(
     [ "uint256", "uint256", "address","bytes32","bytes32" ],
     [this.nonce,
      this.transferredAmount,
      util.addHexPrefix(this.channelAddress),
      this.locksRoot,
      util.toBuffer(this.getMessageHash())]);
    return solidityHash;
  }

  getMessageHash(){
    throw new Error("unimplemented getMessageHash");
  }

  toProof(){
    return new ProofMessage(this.nonce, this.transferredAmount, this.locksRoot,this.channelAddress,this.messageHash);
  }

}

class Lock extends Hashable{
  constructor(){
    this.amount = new util.BN(0);
    this.expiration=new util.BN(0);
    this.hashLock = EMPTY_32BYTE_BUFFER;
  }

  getHash(){
    return abi.soliditySHA3(['uint256','uint256','bytes32'],
      this.amount, this.expiration, this.hashLock);
  }

}


class DirectTransfer extends ProofMessage{


}

class LockedTransfer extends DirectTransfer{

  constructor(){
    super();
    this.to = ""; //EthAddress

  }

  getMessageHash(){
    throw new Error("unimplemented getSignableHash");
  }

}

class MediatedTransfer extends LockedTransfer{
  constructor(){
    super();
    this.target = ""; //EthAddress
  }
}

class RequestSecret extends SignedMessage{
  constructor(){
    super();
    this.hashLock = EMPTY_32BYTE_BUFFER; //Serializable Lock Object
    this.amount = util.BN(0);
  }

  getHash(){
    abi.soliditySHA3(
     [ "bytes32","uint256"],
     [this.hashLock, this.amount]
     );
  }
}

class RevealSecret extends SignedMessage{
  constructor(){
    super();
  }
}

class Secret extends ProofMessage{
  constructor(){
    super();
  }
}

//unsigned ACK
class Ack{
  constructor(){
    this.messageHash;
  }
}

module.exports= {
  SignedMessage,ProofMessage,DirectTransfer,LockedTransfer,MediatedTransfer,
  RequestSecret,RevealSecret,Secret,Ack,Lock, JSON_REVIVER_FUNC
}
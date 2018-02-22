const util = require('ethereumjs-util');
util.Buffer = require('buffer').Buffer;
// Expects elements to be Buffers of length 32
// Empty string elements will be removed prior to the buffer check
// by default, order is not preserved
function MerkleTree(elements,ordered) {
  this.ordered = ordered;
  // remove empty strings
  this.elements = elements.filter(function(n){ return n != undefined });

  // check only buffers have been submitted
  for(var i=0; i< this.elements.length; i++){
    //if the element was a buffer, it was left untouched, if it was hex or string, converted
    var buffer = util.toBuffer(this.elements[i]);
    if(!(buffer.length ==32)){
      throw new Error("32 byte buffer expected as input element");
    }
  }
  this.levels = [];
  if(!ordered){
    this.levels.push(this.elements.sort(Buffer.compare));
  }else{
    this.levels.push(this.elements);
  }
}

MerkleTree.prototype.getRoot = function() {
  return this.levels[this.levels.length - 1][0]
}




//From @AmitShah github
MerkleTree.prototype.generateHashTree=  function(){
    var level = this.levels[0];
    do{
        //212afc935a5685e12f22195713fac5ba98989c7dda8b0764f5e8256fc1544a075b9972cfef311465c48e55f03a979b661529a5671b939fdd85e842af34650d90
        level = this.sumLevel(level);
        this.levels.push(level);
    }while(level.length> 1);
}

//From @AmitShah github
//encoding keccak256 hashes of the transactions in order of nonce
MerkleTree.prototype.sumLevel = function(elements){
    //move to front of array
    var result = [];

    var zeroBuffer = util.toBuffer(0);
    var k = 0;
//    we cant really balance the tree, that maybe crazy at larger transaction counts
//      akin to perhaps preallocating a binary tree
//    if([temp count] % 2 != 0){
//        keccack_256(hash, 32, zero, 32);
//        [temp addObject:[NSValue valueWithPointer:hash]];
//    }

    while(k < elements.length){

        var a = elements[k++];
        var b = null;
        var hash = null;
        var buffer = null;
        if(k < elements.length){
            //concat buffers
            buffer =concatBuffer(a,elements[k++],this.ordered);
           //we re-use and blowup the hash value stored
            hash = util.sha3(buffer);
            result.push(hash);

        }else{
            //send up the hash as is on the tree
            result.push(elements[k-1]);
        }
    }


    //move enumerator back to the end

    return result;
}


function concatBuffer(a,b,ordered){
  //TODO: IS this portable??
  //TypedArrays apparent supported across all browser, have to see if safari webkit supports
  //incremental sort of buffers
  if(!ordered){
    return util.Buffer.concat([a,b].sort(Buffer.compare));
  }else{
    return util.Buffer.concat([a,b]);
  }
}

MerkleTree.prototype.generateProof = function(hashedElement){

    var result = [];
    var k =0;
    if(!(hashedElement.length ===32 && util.Buffer.isBuffer(hashedElement))){
      throw new Error("a proof can only be generated for a hashed element, please try hashing your element before sending");
    }
    //Get the index of the element first
    for(var i = 0; i < this.levels[0].length; i++){
        var v = this.levels[0][i];

        if(hashedElement.compare(v)===0){
            break;
        }
        k++;
    }

    //now go through the layers to make the proof
    for(var i=0; i < this.levels.length;i++){
        var level = this.levels[i];
        var v = this._getProofPair(k,level);
        if(v){
            result.push(v);
        }
        k = Math.floor(k/2);
    }

    return result;

}

MerkleTree.prototype._getProofPair = function(index,level){
    var pairIndex = (index+1) %2 ==0 ? index -1 : index +1;
    if(pairIndex < level.length){
        return level[pairIndex];
    }
    return null;
}

MerkleTree.prototype.addElement = function(hashedElement){
  throw new Error("addElement not yet implemented");
}

MerkleTree.prototype.removeElement = function(hashedElement){
  throw new Error("removeElement not yet implemented");
}

MerkleTree.prototype.removeElementAtIndex = function(index){
  throw new Error("removeElementAtIndex not yet implemented");
}

MerkleTree.prototype.verify = function(proof,root,hashedElement){
  throw new Error("verify not yet implemented");
}

//=========================== GLOBAL Proof Functions ==========================//

// pragma solidity ^0.4.19;

// contract MerkleProof {

// function checkProof(bytes proof, bytes32 root, bytes32 hash) public pure returns (bool){

//     bytes32 el;
//     bytes32 h = hash;

//     for (uint256 i = 32; i <= proof.length; i += 32) {
//         assembly {
//             el := mload(add(proof, i))
//         }

//         if (h < el) {

//             h = keccak256(h, el);
//         } else {
//             h = keccak256(el, h);
//         }
//     }

//     return h == root;
//   }

//   // from StorJ -- https://github.com/nginnever/storj-audit-verifier/blob/master/contracts/MerkleVerifyv3.sol
// function checkProofOrdered(bytes proof, bytes32 root, bytes32 hash, uint256 index)public pure  returns (bool) {
//     // use the index to determine the node ordering
//     // index ranges 1 to n

//     bytes32 el;
//     bytes32 h = hash;
//     uint256 remaining;

//     for (uint256 j = 32; j <= proof.length; j += 32) {
//       assembly {
//         el := mload(add(proof, j))
//       }

//       // calculate remaining elements in proof
//       remaining = (proof.length - j + 32) / 32;

//       // we don't assume that the tree is padded to a power of 2
//       // if the index is odd then the proof will start with a hash at a higher
//       // layer, so we have to adjust the index to be the index at that layer
//       while (remaining > 0 && index % 2 == 1 && index > 2 ** remaining) {
//         index = uint(index) / 2 + 1;
//       }

//       if (index % 2 == 0) {
//         h = keccak256(el, h);
//         index = index / 2;
//       } else {
//         h = keccak256(h, el);
//         index = uint(index) / 2 + 1;
//       }
//     }

//     return h == root;
//   }
// }

function checkMerkleProofOrdered(proof, root, element, index) {
  // use the index to determine the node ordering
  // index ranges 1 to n

  var tempHash = element;

  for (var i = 0; i < proof.length; i++) {
    var remaining = proof.length - i;

    // we don't assume that the tree is padded to a power of 2
    // if the index is odd then the proof will start with a hash at a higher
    // layer, so we have to adjust the index to be the index at that layer
    while (remaining && index % 2 === 1 && index > Math.pow(2, remaining)) {
      index = Math.round(index / 2)
    }

    if (index % 2 === 0) {
      //right append for even index
      tempHash = util.sha3(concatBuffer(proof[i], tempHash,true));
    } else {
      tempHash = util.sha3(concatBuffer(tempHash, proof[i],true));
    }
    index = Math.round(index / 2)
  }
  return tempHash.equals(root)
}

function checkMerkleProof(proof,root,element){
  //TODO sort each element in some lexigraphic order same as solidity would
  //or require preprocessing of proof such that elements are summed left to right
 var buffer = proof.reduce(function(acc, currentValue){
    return util.sha3(concatBuffer(acc,currentValue));
  },element);
  return root.compare(buffer)===0;
}

function printTree(merkletree)
{

    for(var i =0; i < merkletree.levels.length;i++){
        var level = merkletree.levels[i];
        console.log("----------------LEVEL"+i+"--------- \r\n \r\n");
        for(var j =0; j < level.length ; j++){
            console.log(util.bufferToHex(level[j]));
        }
  }

}

var elements = [];
for(var i=0; i < 10; i++){
  elements.push(util.sha3("elem"+i));
}
var merkletree = new MerkleTree(elements);

merkletree.generateHashTree();

printTree(merkletree);

var proof = merkletree.generateProof(elements[9]);
console.log("=============== MERKLE PROOF GENERATED =================");
for(var i =0; i < proof.length; i++){
  var p = proof[i];
  console.log(util.addHexPrefix(p.toString('hex')))
}
debugger;
var verified= checkMerkleProof(proof,merkletree.getRoot(),elements[9], 5+1 );
debugger;

merkletree = new MerkleTree(elements,true);

merkletree.generateHashTree();
printTree(merkletree);

var proof = merkletree.generateProof(elements[9]);
console.log("=============== MERKLE PROOF GENERATED =================");
for(var i =0; i < proof.length; i++){
  var p = proof[i];
  console.log(util.addHexPrefix(p.toString('hex')))
}
debugger;
var verified= checkMerkleProof(proof,merkletree.getRoot(),elements[9], 9+1 );
debugger;


//Expected Results for Ordered
// [ <Buffer 21 2a fc 93 5a 56 85 e1 2f 22 19 57 13 fa c5 ba 98 98 9c 7d da 8b 07 64 f5 e8 25 6f c1 54 4a 07>,
//   <Buffer 5b 99 72 cf ef 31 14 65 c4 8e 55 f0 3a 97 9b 66 15 29 a5 67 1b 93 9f dd 85 e8 42 af 34 65 0d 90>,
//   <Buffer ab 23 f4 79 c7 36 58 4d f5 14 56 eb 30 14 12 6c 3b b0 6d db a7 60 9c f0 a6 13 4c 67 ab 33 8b 38>,
//   <Buffer 8c f8 1f 60 f7 6c 15 77 1a 92 8b 9a c6 7a 41 2a 4f 56 99 15 9a 71 ef 87 02 16 35 16 41 c9 5a 8d>,
//   <Buffer d9 78 40 e2 42 54 94 ce f8 bb 36 72 d3 a3 e6 1c f3 44 81 78 b8 12 de bd 80 f1 2f 35 92 8e 86 c1>,
//   <Buffer c7 05 fb ad 90 71 9f 6b b6 4b 3d db cc 49 88 ca 62 fd 05 c7 18 76 3f c7 d0 1d 80 62 b5 42 e2 c0>,
//   <Buffer d8 30 a6 79 db 78 94 fa d9 84 00 d7 16 56 ca a2 eb 3f 3c 13 9c ba 9c 7a 50 f1 ad 51 5d c6 96 5a>,
//   <Buffer f2 63 e4 ed 6f 59 35 70 fe de f9 5d f4 8e dc 68 b4 74 89 9f b5 57 db ed d3 3b 5c da 68 c7 c3 a5>,
//   <Buffer 68 7d d1 61 dd b1 2b 55 25 64 6b 2d 25 4c b5 d8 ce bc d4 6f 2e 66 43 71 98 a6 82 5d e1 99 6d 79>,
//   <Buffer af a1 c5 5f 57 55 ed 63 3c 83 00 80 33 c9 6c 6f 99 82 4d 40 74 78 c7 16 c6 8b be b6 46 b2 61 f6> ]
// <Buffer 41 51 7c 6b 70 b7 f9 93 fa 93 3b 97 3f ef 45 ff 60 e8 33 0a c3 ef a8 55 8d b9 8c a1 21 ee e6 d5>
// <Buffer af a1 c5 5f 57 55 ed 63 3c 83 00 80 33 c9 6c 6f 99 82 4d 40 74 78 c7 16 c6 8b be b6 46 b2 61 f6>
// [ <Buffer 68 7d d1 61 dd b1 2b 55 25 64 6b 2d 25 4c b5 d8 ce bc d4 6f 2e 66 43 71 98 a6 82 5d e1 99 6d 79>,
//   <Buffer 80 23 01 ae af 34 6e 8e ce 74 49 e2 4b 1b d5 0f 1d 28 2b 1e da e2 4e 86 84 4e 2a d9 a8 b4 11 0d> ]

//Expected result for UnOrdered
// [ <Buffer 21 2a fc 93 5a 56 85 e1 2f 22 19 57 13 fa c5 ba 98 98 9c 7d da 8b 07 64 f5 e8 25 6f c1 54 4a 07>,
//   <Buffer 5b 99 72 cf ef 31 14 65 c4 8e 55 f0 3a 97 9b 66 15 29 a5 67 1b 93 9f dd 85 e8 42 af 34 65 0d 90>,
//   <Buffer ab 23 f4 79 c7 36 58 4d f5 14 56 eb 30 14 12 6c 3b b0 6d db a7 60 9c f0 a6 13 4c 67 ab 33 8b 38>,
//   <Buffer 8c f8 1f 60 f7 6c 15 77 1a 92 8b 9a c6 7a 41 2a 4f 56 99 15 9a 71 ef 87 02 16 35 16 41 c9 5a 8d>,
//   <Buffer d9 78 40 e2 42 54 94 ce f8 bb 36 72 d3 a3 e6 1c f3 44 81 78 b8 12 de bd 80 f1 2f 35 92 8e 86 c1>,
//   <Buffer c7 05 fb ad 90 71 9f 6b b6 4b 3d db cc 49 88 ca 62 fd 05 c7 18 76 3f c7 d0 1d 80 62 b5 42 e2 c0>,
//   <Buffer d8 30 a6 79 db 78 94 fa d9 84 00 d7 16 56 ca a2 eb 3f 3c 13 9c ba 9c 7a 50 f1 ad 51 5d c6 96 5a>,
//   <Buffer f2 63 e4 ed 6f 59 35 70 fe de f9 5d f4 8e dc 68 b4 74 89 9f b5 57 db ed d3 3b 5c da 68 c7 c3 a5>,
//   <Buffer 68 7d d1 61 dd b1 2b 55 25 64 6b 2d 25 4c b5 d8 ce bc d4 6f 2e 66 43 71 98 a6 82 5d e1 99 6d 79>,
//   <Buffer af a1 c5 5f 57 55 ed 63 3c 83 00 80 33 c9 6c 6f 99 82 4d 40 74 78 c7 16 c6 8b be b6 46 b2 61 f6> ]
// <Buffer cb b3 cf cc d0 7d ea 3c 7f d8 a4 77 57 b4 1e 0e d4 b6 c2 cb 5c 95 34 8f 99 20 47 c7 e5 40 7e d6>
// <Buffer af a1 c5 5f 57 55 ed 63 3c 83 00 80 33 c9 6c 6f 99 82 4d 40 74 78 c7 16 c6 8b be b6 46 b2 61 f6>
// [ <Buffer ab 23 f4 79 c7 36 58 4d f5 14 56 eb 30 14 12 6c 3b b0 6d db a7 60 9c f0 a6 13 4c 67 ab 33 8b 38>,
//   <Buffer 39 3d 04 f7 57 9c 3a f5 5a 77 03 48 cd a9 8a 56 57 b8 af 85 38 b7 63 de 2f de 37 a2 90 d9 e5 c0>,
//   <Buffer 9c 52 ae e0 8f 4a 2b 88 89 af 60 94 a3 98 c9 40 76 4d c2 2f ef c1 15 46 d1 5d 78 44 e1 f3 da 2c>,
//   <Buffer 57 69 63 83 cf e5 51 f8 2d 23 cc 93 07 66 ef 31 64 b4 11 25 15 4c 6f 9d f0 8e 12 e6 9e 03 58 eb> ]

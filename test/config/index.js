// todo: make the config more configurable

const blockchainService = require('blockchain-service')
const persist = require('node-persist')

// const MQTT_URL = 'wss://bdsrzqit:0TAUbk-2q5es@m13.cloudmqtt.com:31001'
const MQTT_URL = 'mqtt://test.mosquitto.org'

module.exports = (network) => {
  const networkConfig = network ? require(`./${network}.config`) : {}
  return Object.assign({
    NETWORK: network,
    initP2P: (address) => {
      persist.initSync({
        dir: `${__dirname}/storage.dat/${process.argv[1].split('/').pop().replace(/\./g, '_')}`
      })
      return new blockchainService.P2P({
        address: address,
        mqttUrl: MQTT_URL,
        storage: {
          getItem: (id) => persist.get(id),
          setItem: (id, item) => persist.set(id, item),
          getAllKeys: () => Promise.resolve(persist.keys()),
      
          multiGet: (keys) => Promise.all(keys.map(k =>
            persist.get(k).then(v => ([k, v])))),
          multiSet: (xs) => Promise.all(
            xs.map(x => persist.setItem(x[0], x[1]))
          ).then(() => true).catch(() => false)
        }
      })
    }
  }, networkConfig)
}
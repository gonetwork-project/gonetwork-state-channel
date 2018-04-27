// todo: make the config more configurable

module.exports = (network) => {
  const networkConfig = network ? require(`./${network}.config`) : {}
  return Object.assign({
    NETWORK: network,
    MQTT_URL: 'wss://bdsrzqit:0TAUbk-2q5es@m13.cloudmqtt.com:31001'
  }, networkConfig)
}
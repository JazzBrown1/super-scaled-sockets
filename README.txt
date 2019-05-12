 --- sssClient ---

sssClient.client: function client(url, prefs, callback(client)) return client
sssClient.statusCodes: {}
sssClient.statusCodes.client: {}
sssClient.statusCodes.subscription: {}
sssClient.statusCodes.clientText {}
sssClient.statusCodes.subscriptionText {}

client

client.connect: function connect(callback(userSubscription))
client.subscribe: function subscribe(channel, query, callback(err, subscription)
client.client.getStatus: function getStatus()
client.onTell: function onTell(callback(msg))
client.onError: function onError(callback(error))
client.onReconnect: function onReconnect(callback())
client.onDrop: function onDrop(callback()
client.onStatusChange: function onStatusChange(callback(status, oldStatus))
client.onFail: function onFail(callback()
client.ask: function ask(topic, msg, callback(err, msg))
client.tell: function tell(topic, msg, callback(err))

subscription

subscription.getStatus: function getStatus()
subscription.on: function on(topic, callback(msg))
subscription.unsubscribe: function unsubscribe()
subscription.onStatusChange: function onStatusChange(callback(status, oldStatus))
subscription.onError: function onError(callback(error))

 --- sssServer ---

sssServer.server: function server(scaler, prefs, callback(server)) return server
sssServer.scaler.mongoRedis: function(mongoCredentials, redisCredentials, callback(err, scaler))

server

server.connect(callback(err))
server.onSocket(callback(socket))
server.publish: function publish(channelName, topic, msg)
server.publishToMany: function publishToMany(channelNames, topic, msg)
server.onChannelOpen: function onChannelOpen(callback())
server.onChannelClose: function onChannelClose(callback())
server.onPublish: function onPublish(callback())

channel

channel.sockets: [array of socket objects]
channel.locals: {}
channel.name: name
channel.publish: function publish(topic, msg)

socket

socket.info: ws.info
socket.locals: {}
socket.publish: function publish(channelName, topic, msg)
socket.isSubscribed: function isSubscribed(channelName) return Boolean
socket.onSubscribe: function onSubscribe(callback)
socket.onClose: function onClose(callback)
socket.onAsk: function onAsk(topic, callback)
socket.onTell: function onTell(topic, callback)
socket.tell: function tell(topic, msg)

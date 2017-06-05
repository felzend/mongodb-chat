var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongodb = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var CryptoJS = require("crypto-js");

var random_number = require("random-js")(); // random_number.integer()
var random_string = require("randomstring"); // randomstring.generate(); | randomstring.generate(7);

var db_url = 'mongodb://localhost:27017/chatbot';
var clients = [];
var chat = []; 

var key = '';
var global_key = 'felipedesouzafernandes';

// ----------------------------------------------------------------------- //

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

// ----------------------------------------------------------------------- //

io.on('connection', function(socket){
	console.log('----> New Connection!');

	socket.data = {
		id: generateId(),
		username: generateUsername(),
		timestamp: new Date().getTime(),
	};

	clients.push( socket.data );
	io.emit('clients_count', {clients: clients});
	io.emit('connected', {client: socket.data});	
	socket.emit('key', {key: key});
	socket.emit('retrieve_username', socket.data );
	socket.emit('clear_chat');	
	socket.emit('chat', { messages: chatCrypt(chat, key) });

	socket.on('send_text', function(data) {
		var message = data;
		message._id = generateObjectId();
		message.timestamp = new Date().getTime()		
		
		var cryptedMessage = {
			_id: message._id,
			id: message.id,
			username: message.username,
			text: CryptoJS.AES.encrypt( message.text, key ).toString(),
			timestamp: message.timestamp,
		};

		chat.push( message );		
		io.emit('chat', { 
			messages: [ cryptedMessage ] 
		});		
	});

	socket.on("disconnect", function() {
		deleteClient( socket.data.id );
		io.emit('clients_count', {clients: clients});
		io.emit('disconnected', {client: socket.data});
		console.log("----> Client Disconnected. ("+clients.length+")");
	});
});

http.listen(3000, function(){
	console.log('listening on *:3000');
	mongodb.connect(db_url, function(err, db) {
		if( err ) throw(err);
		key = random_string.generate( random_number.integer( 5, 8 ) );
		console.log("Database Connection: successfully!");		
		var collection = db.collection('chat');		
		collection.find().toArray(function(err, results) {

			if( results.length > 0 )
			{
				for( var r = 0; r < results.length; r++ )
				{
					var message = results[r];
					var bytes  = CryptoJS.AES.decrypt( message.text, global_key );
					message.text = bytes.toString(CryptoJS.enc.Utf8);
					chat.push(message);
				}							
			}

			setInterval(function() {
				chatSnapshot( db, function(result) {});
			}, 1000);
		});		
	});
});

// ----------------------------------------------------------------------- //

chatCrypt = function( c, k ) {
	var crypted = [];	
	for( var a = 0; a < c.length; a++ ) {
		var encrypted = CryptoJS.AES.encrypt( c[a].text, k ).toString();
		var message = c[a];
		crypted.push({
			_id: message._id,
			id: message.id, 
			username: message.username, 
			text: encrypted, 
			timestamp: message.timestamp
		});
	}
	return crypted;
}

var generateObjectId = function() {
	return random_string.generate({
		length: 24,
		charset: 'hex',
		capitalization: 'lowercase'
	});
}

var chatSnapshot = function( db, callback ) {
	var collection = db.collection('chat');
	if( chat.length > 0 )
	{
		for( var m = 0; m < chat.length; m++ )
		{
			var message = chat[m];			
			collection.findOne( { _id: message._id }, function( err, results ) {				
				if( err ) throw( err );
				if( results == null )
				{					
					var encrypted = CryptoJS.AES.encrypt( message.text, global_key ).toString();					
					collection.insert({
						_id: message._id,
						id: message.id, 
						username: message.username, 
						text: encrypted, 
						timestamp: message.timestamp
					}, function( err, result ) {
						if(err) throw(err);
						console.log( "Inserted "+message._id);
					});
				}				
			});			
		}
	}
};

var generateId = () => {
	let id = random_number.integer(1, 10000);
	for(let a = 0; a < clients.length; a++)
	{
		if( clients[a].id === id ) {
			id = random_number.integer(1, 10000);
			a = 0;
		}
	}

	return id;
};

var generateUsername = () => {
	let username = random_string.generate( random_number.integer(5, 15) );
	for(let a = 0; a < clients.length; a++)
	{
		if( clients[a].username === username ) {
			username = random_string.generate( random_number.integer(5, 15) );
			a = 0;
		}
	}

	return username;
};

var deleteClient = (id) => {
	let client = clients.filter( ( c, i ) => {
		if( c.id == id) {
			clients.splice( i, 1 );
			return;
		}
	});
};

// ----------------------------------------------------------------------- //
var sys = require( 'sys' )
  , path = require( 'path' )
  , fs = require( 'fs' )
  , util = require('util')
  , IRC
  , Jerk

/* ------------------------------ Init ------------------------------ */
require( './strftime' )
require.paths.unshift( path.join( __dirname, '..', 'node_modules' ) )
IRC = require( 'irc-js' )

/* ------------------------------ Jerk ------------------------------ */
Jerk = new ( function Jerk() {
  var bot
    , watchers = []
    , join_watchers = []
    , leave_watchers = []
    , nick_change_watchers = []
    , connect = _connect.bind( this )
    , watch_for = _watch_for.bind( this )
    , user_join = _user_join.bind(this)
    , user_leave = _user_leave.bind(this)
    , user_nick_change = _user_nick_change.bind(this)

  /* ------------------------------ Public Methods ------------------------------ */
  this.addWatchers = function( block ) {
    block( { watch_for: watch_for, 
                  user_join: user_join, 
                  user_leave: user_leave, 
                  user_nick_change: user_nick_change } )
    return { connect: connect }
  }

  /* ------------------------------ Private Methods ------------------------------ */
  function _connect( options ) {
    bot = new IRC( options || {} )
    bot
      .on( 'privmsg', _receive_message.bind( this ) )
      .on( 'join', _user_joined.bind( this ) )
      .on( 'part', _user_leaving.bind( this ) )
      .on( 'quit', _user_leaving.bind( this ) )
      .on( 'nick', _user_changing_nick.bind( this ) )
      .on( 'error', function( message ) {
        console.log( 'There was an error! "' + message + '"' )
        this.disconnect().connect( _on_connect.bind( this ) )
      })
      .connect( _on_connect.bind( bot ) )
    return { say:     _privmsg_protected.bind( this )
           , action:  _bot_do( function( to, msg ) { return bot.privmsg( to, '\001ACTION ' + msg + '\001' ) } ).bind( this )
           , ctcp:    _ctcp_protected.bind( this )
           , irc:     bot
           , part:    _bot_do( 'part' ).bind( this )
           , join:    _bot_do( 'join' ).bind( this )
           , quit:    _bot_do( 'quit' ).bind( this )
           , nick:    _bot_do('nick').bind( this )
           }
  }

  function _on_connect() {
    if ( this.options.waitForPing )
      this.once( 'ping', justDoIt )
    else
      justDoIt.call( this )

    function justDoIt () {
      setTimeout( function() {
        // Join channels
        var i
        if ( Array.isArray( this.options.channels ) )
          for ( i = 0; i < this.options.channels.length; i++ )
             this.join.apply( this, this.options.channels[i].split(':') )

        // Call onConnect callback
        if ( this.options.onConnect )
          this.options.onConnect()
      }.bind( this ), this.options.delayAfterConnect || 1000 )
    }
  }

  function _watch_for( pattern, hollaback ) {
    watchers.push([ pattern, hollaback ])
  }

  function _user_join( hollaback ) {
    join_watchers.push( hollaback )
  }

  function _user_leave( hollaback ) {
    leave_watchers.push( hollaback )
  }

  function _user_nick_change( hollaback ) {
    nick_change_watchers.push( hollaback )
  }
  
  function _receive_message( message ) {
    var i = watchers.length
      , md

    while ( i-- )
      if ( md = message.params.slice( -1 ).toString().match( watchers[i][0] ) )
        watchers[i][1]( _make_message( message, md ) )
  }

  function _user_joined( message ) {
    if ( message.person.nick == bot.options.nick )
      return

    var i = join_watchers.length

    while ( i-- )
      join_watchers[i]( _make_message( message ) )
  }

  function _user_leaving( message ) {
    if ( message.person.nick == bot.options.nick )
      return

    var i = leave_watchers.length

    while ( i-- )
      leave_watchers[i]( _make_message( message ) )
  }
  
  function _user_changing_nick( message ) {
    if ( message.person.nick == bot.options.nick ) {
      // Bot changed its own nick
      bot.options.nick = message.params[0]
      return
    }
    
    var i = nick_change_watchers.length
    
    while ( i--)
      nick_change_watchers[i]( _make_message( message ) )
  }

  function _bot_do( what ) {
    if ( typeof what === 'string' )
      return function() { return bot[what].apply( bot, arguments ) }
    else
      return what
  }

  function _privmsg_protected( receiver, msg ) {
    return bot.privmsg( receiver, msg, true )
  }

  function _ctcp_protected( receiver, msg ) {
    // See low level quoting in http://www.irchelp.org/irchelp/rfc/ctcpspec.html
    function encode(m) {
      return ( m.replace(/\020/g, '\020\020')
                .replace(/\n/g, '\020n')
                .replace(/\r/g, '\020r')
                .replace(/\000/g, '\0200') )
    }
    var match = encode(msg).match(/^\s*(\w*)(.*)/)
    var command = match[1].toUpperCase()
    var parameters = match[2]
    return bot.privmsg( receiver, '\001' + command + parameters + '\001' )
  }

  function _to_string() {
    return new Date().strftime( '[%H:%M]' ) + ' <' + this.user + '> ' + this.text
  }

  function _make_message ( message, md ) {
    var source = message.params[0] == bot.options.nick ? message.person.nick : message.params[0]
    return true,
      { say:        _privmsg_protected.bind( this, source )
      , msg:        _privmsg_protected.bind( this, message.person.nick )
      , match_data: md || []
      , user:       message.person.nick
      , source:     source
      , text:       message.params.slice( -1 )
      , toString:   _to_string
      }
  }

})()

/* ------------------------------ Package Info ------------------------------ */
fs.readFile( path.join( __dirname, '..', 'package.json' ), function( err, data ) {
  if ( err )
    throw err
  else
    Jerk.info = JSON.parse( data )
})

/* ------------------------------ EXPORTS ------------------------------ */
module.exports = Jerk.addWatchers


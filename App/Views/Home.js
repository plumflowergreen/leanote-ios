/**
 * App登录界面
 *
 */

'use strict';

var React = require('react-native');
var {
  AppRegistry,
  AsyncStorage,
  StyleSheet,
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ScrollView
} = React;

var Api = require("../Common/Api");
var Base = require("../Common/Base");
var Spinner = require("../Components/Spinner");

var Router = require('react-native-router');
var AlLNoteList = require('./AllNoteList.js');

var BackButton = require("../Components/BackButton");
var SideBarButton = require("../Components/SideBarButton");
var RefreshButton = require("../Components/RefreshButton");

module.exports = React.createClass({
  firstRoute: {
    name: '所有笔记',
    data: {update: false},
    component: AlLNoteList,
    leftCorner: SideBarButton,
    rightCorner: RefreshButton
  },

  getInitialState: function() {
    return {
      update: false
    }
  },
  _handleAction: function(evt) {

    switch(evt.action) {
      case 'refresh':
        this._refreshNotes();
        break;
      case 'sidebar':
        this._siderbar();
        break;

    }
  },
  _siderbar: function() {
    console.log("open sidebar");
  },
  _refreshNotes: function() {
    console.log('refresh');
    this.setState({update: true});
    this.firstRoute.data.update = true;
  },
  render: function() {
    return (
      <View style={styles.container}>
        <Router
          firstRoute={this.firstRoute}
          headerStyle={styles.header}
          backButtonComponent={BackButton}
          customAction={this._handleAction}
        />
      </View>
    )
  }
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  header: {
    backgroundColor: '#0379d5'
  }
});

import React, { Component } from "react";
import { TokenBar } from "../Components";



// { name: 'words',        active: true,  dataType: 'string', constraints: []},
// { name: 'basic',        active: true,  dataType: 'string', constraints: []},
// { name: 'probability',  active: false, dataType: 'number', constraints: []},
// { name: 'POS',          active: false, dataType: 'string', constraints: []},
// { name: 'embedding',    active: false, dataType: 'vector', constraints: []},
// { name: 'critic' ,      active: false, dataType: 'string', constraints: []}

export class Prism {
  constructor(name, dataType) {
    this.name = name;
    this.dataType = dataType;
    this.active = false;
    this.activeConstraints = [];
  }
}

export class PrismRange extends Component {
  constructor(props) {
    super(props);
    this.tokenManager = this.props.tokenManager;
    this.state = {
      selection: this.props.selection,
    };
  }

  render() {
    return <TokenBar tokenManager={this.tokenManager} 
      type={this.props.type}
      // type={this.props.lense.dataType} 
      startChar={this.props.startChar} endChar={this.props.endChar}/>
  }
}
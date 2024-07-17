import React, { Component } from "react";

export class ActivePrismIndicator extends Component {
  constructor(props) {
    super(props);
    this.shouldHighlight = this.props.shouldHighlight; // passed in as a prop to trigger changes correctly
  }

  toggleHighlight() {
    this.setState({ shouldHighlight: !this.props.prism.shouldHighlight });

    // tell the parent that the highlight has changed, which will update the prism.shouldHighlight
    if (this.props.onHighlightChange) {
      this.props.onHighlightChange(this.props.prism.name, !this.props.prism.shouldHighlight);
    }
  }

  render() {  
    let prism = this.props.prism;

    return <span id={`active-highlight-` + prism.name} className="highlight">
              {prism.name}
              <input type="checkbox" id={`highlight` + prism.name} className="highlight-check" checked={this.props.shouldHighlight} onChange={this.toggleHighlight.bind(this)}/>
            </span>
  }
}



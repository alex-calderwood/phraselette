import React, { Component, useState } from "react";
import { BetterRhymeConstraint, CategoricalConstraint, 
  NumericalRangeConstraint, WordLengthConstraint, SoundConstraint} from "../../base/Constraint";
import { LogHistogram } from "../Histogram"

import {CategoryListConstraintView, RangeConstraintView, HistogramRangeConstraintView} from "./ConstraintView"
import { SoundConstraintView } from "./SoundConstraintView"

const constraintViews = {
  CategoricalConstraint: CategoryListConstraintView,
  POSConstraint: CategoryListConstraintView,
  SoundConstraint: SoundConstraintView,
  RhymeConsntraint: CategoryListConstraintView,
  BetterRhymeConstraint: CategoryListConstraintView,
  WordLengthConstraint: RangeConstraintView,
  NumericalRangeConstraint: HistogramRangeConstraintView,
};

export class ConstraintRender extends React.Component {
  render() {
    const { constraint, ...otherProps } = this.props;
    const ConstraintView = constraintViews[constraint.constructor.name];
    return ConstraintView ? <ConstraintView key={constraint.id} constraint={constraint} {...otherProps} /> : null;
  }
}
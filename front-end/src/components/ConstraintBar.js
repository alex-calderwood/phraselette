import React from 'react';
import { useTooltip } from './Tooltip';

export const ConstraintBar = ({ constraints, onTooltipUpdate, removeConstraint }) => {
  const { handleMouseEnter, handleMouseLeave, handleMouseMove } = useTooltip(onTooltipUpdate);

  if (!constraints || constraints.length === 0) {
    return null;
  }

  const onRemoveConstraint = (constraint) => {
    console.log('Removing constraint:', constraint);
    removeConstraint(constraint);
  }

  const formatNumber = (num) => {
    if (num === undefined || num === null) return '';
    return Number.isInteger(num) ? num : Number(num).toFixed(2);
  };

  const ConstraintItem = ({ constraint }) => {
    const displayTargetSequence = () => {
      if (!constraint.targetSequence) return null;
      return constraint.targetSequence.map(t => {
        const value = t.pos || t.sound || Object.values(t)[0];
        return value;
      }).join(' ');
    };

    return (
      <div className="constraint-bar-item glass-pane" >
        <div className="constraint-info">
          <div className="title">{constraint.feature?.plain}</div>
          
          <div className="constraint-details">
            {constraint.mode && (
              <span className="mode">
                {constraint.mode}
              </span>
            )}
            
            {constraint.targetMin !== undefined && (
              <span className="range">
                <span className="label">min</span>
                <span className="value">{formatNumber(constraint.targetMin)}</span>
                <span className="label">max</span>
                <span className="value">{formatNumber(constraint.targetMax)}</span>
              </span>
            )}
            
            {constraint.targetSequence && (
              <span className="target">
                {displayTargetSequence()}
              </span>
            )}
          </div>
        </div>

        <button
          className="constraint-delete-btn"
          // onmouseenter breaks the delete for some reason
          // onMouseEnter={e => handleMouseEnter(`Delete ${constraint.feature?.plain} constraint`, e)}
          // onMouseLeave={handleMouseLeave}
          // onMouseMove={handleMouseMove}
          onClick={e => {
            onRemoveConstraint(constraint);
          }}
        >
          ×
        </button>
      </div>
    );
  };

  const handleWheel = (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="flex flex-col w-full">
      <div className='wells-title'>
        Constraints ({constraints.length})
      </div>
      
      <div className="constraint-bar" onWheel={handleWheel}>
        {constraints.map((constraint) => (
          <ConstraintItem 
            key={constraint.id} 
            constraint={constraint}
          />
        ))}
      </div>
    </div>
  );
};
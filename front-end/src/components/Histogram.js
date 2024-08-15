import React, { useState, useRef, useEffect } from 'react';

const defaultRange = [-35e10, 0]

export const LogHistogram = ({ data, onUpdate }) => {
  const [minValue, setMinValue] = useState( data ? data.bin_edges?.[0] : defaultRange[0] );
  const [maxValue, setMaxValue] = useState( data ? data?.bin_edges?.[data.bin_edges?.length - 1] : defaultRange[1] );
  const canvasRef = useRef(null);
  const parentRef = useRef(null);
  const isDraggingRef = useRef(null);
  
  useEffect(() => {
    const resizeCanvas = () => {
      const parent = parentRef.current;
      if (parent && canvasRef.current) {
        canvasRef.current.width = parent.clientWidth;
        canvasRef.current.height = parent.clientHeight;
        drawHistogram();
      }
    };
      window.addEventListener('resize', resizeCanvas);
      resizeCanvas();
      
      return () => window.removeEventListener('resize', resizeCanvas);
    }, [data, minValue, maxValue]);

    const linearScale = (value, minDomain, maxDomain, minRange, maxRange) => {
    return (value - minDomain) / (maxDomain - minDomain) * (maxRange - minRange) + minRange;
  };

  const inverseLinearScale = (value, minDomain, maxDomain, minRange, maxRange) => {
    return (value - minRange) / (maxRange - minRange) * (maxDomain - minDomain) + minDomain;
  };

  const drawHistogram = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (data?.bin_edges && data?.counts) {
      const maxCount = Math.max(...data.counts);
      const dataMin = data.bin_edges[0];
      const dataMax = data.bin_edges[data.bin_edges.length - 1];
    
      data.counts.forEach((count, index) => {
        const binEdge = data.bin_edges[index];
        const x = linearScale(binEdge, dataMin, dataMax, 0, width);
        const barHeight = (count / maxCount) * height;
        const y = height - barHeight;
    
        const scaledMinValue = linearScale(minValue, defaultRange[0], defaultRange[1], dataMin, dataMax);
        const scaledMaxValue = linearScale(maxValue, defaultRange[0], defaultRange[1], dataMin, dataMax);
    
        if (binEdge >= scaledMinValue && binEdge <= scaledMaxValue) {
          ctx.fillStyle = 'blue';
        } else {
          ctx.fillStyle = 'gray';
        }
    
        ctx.fillRect(x, y, width / data.counts.length, barHeight);
      });
    }

    // Draw min and max lines
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;

    const minX = linearScale(minValue, defaultRange[0], defaultRange[1], 0, width);
    const maxX = linearScale(maxValue, defaultRange[0], defaultRange[1], 0, width);

    ctx.beginPath();
    ctx.moveTo(minX, 0);
    ctx.lineTo(minX, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(maxX, 0);
    ctx.lineTo(maxX, height);
    ctx.stroke();
  };

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const minX = linearScale(minValue, defaultRange[0], defaultRange[1], 0, canvas.width);
    const maxX = linearScale(maxValue, defaultRange[0], defaultRange[1], 0, canvas.width);

    const minDistance = Math.abs(x - minX);
    const maxDistance = Math.abs(x - maxX);

    if (minDistance < maxDistance && minDistance < 10) {
      isDraggingRef.current = 'min';
    } else if (maxDistance < 10) {
      isDraggingRef.current = 'max';
    }
  };

  const handleMouseMove = (e) => {
    if (isDraggingRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      const newValue = inverseLinearScale(x, defaultRange[0], defaultRange[1], 0, canvas.width);

      if (isDraggingRef.current === 'min') {
        const updatedMin = Math.min(Math.max(defaultRange[0], newValue), maxValue);
        setMinValue(updatedMin);
      } else {
        const updatedMax = Math.max(Math.min(defaultRange[1], newValue), minValue);
        setMaxValue(updatedMax);
      }
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = null;
    onUpdate(minValue, maxValue);
  };

  return (
    <div className="histogram" ref={parentRef}>
      <canvas 
        ref={canvasRef} 
        width={200} 
        height={200}
        className="cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="mt-4">
        <span className="mr-4">Min: {minValue.toFixed(2)}</span>
        <span>Max: {maxValue.toFixed(2)}</span>
      </div>
    </div>
  );
};
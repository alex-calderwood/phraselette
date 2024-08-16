import React, { useState, useRef, useEffect } from 'react';
import { getLogProbToColor } from '../scripts/color'
import { humanLog } from '../scripts/utils'

const defaultRange = [Math.log(1e-12), 0];
const DEFAULT_HEIGHT = 4;
const GAP_HEIGHT = 4;
const gray = '#2f2f2f';

export const LogHistogram = ({ data, onUpdate, hasData }) => {
  const [minValue, setMinValue] = useState(defaultRange[0]);
  const [maxValue, setMaxValue] = useState(defaultRange[1]);
  const canvasRef = useRef(null);
  const parentRef = useRef(null);
  const isDraggingRef = useRef(null);
  
  // Effect for canvas resizing
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
  }, []);

  // Effect for handling data changes
  useEffect(() => {
    if (hasData && data?.bin_edges) {
      const newMinEdge = data.bin_edges[0];
      const newMaxEdge = data.bin_edges[data.bin_edges.length - 1];

      setMinValue(prevMin => {
        if (prevMin < newMinEdge) return newMinEdge;
        if (prevMin > newMaxEdge) return newMaxEdge;
        return prevMin;
      });

      setMaxValue(prevMax => {
        if (prevMax > newMaxEdge) return newMaxEdge;
        if (prevMax < newMinEdge) return newMinEdge;
        return prevMax;
      });
    } else {
      // If we no longer have data, reset to default range
      setMinValue(defaultRange[0]);
      setMaxValue(defaultRange[1]);
    }
  }, [hasData, data]);

  // Effect for redrawing histogram
  useEffect(() => {
    drawHistogram();
  }, [minValue, maxValue, data, hasData]);

  const linearScale = (value, minDomain, maxDomain, minRange, maxRange) => {
    return (value - minDomain) / (maxDomain - minDomain) * (maxRange - minRange) + minRange;
  };

  const inverseLinearScale = (value, minDomain, maxDomain, minRange, maxRange) => {
    return (value - minRange) / (maxRange - minRange) * (maxDomain - minDomain) + minDomain;
  };

  const drawHistogram = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (hasData && data?.bin_edges && data?.counts) {
      const maxCount = Math.max(...data.counts);
      const dataMin = data.bin_edges[0];
      const dataMax = data.bin_edges[data.bin_edges.length - 1];
  
      data.counts.forEach((count, index) => {
        const binEdge = data.bin_edges[index];
        const x = Math.floor(linearScale(binEdge, dataMin, dataMax, 0, width));
        const barWidth = Math.ceil(width / data.counts.length);
        const scaledBarHeight = Math.ceil((count / maxCount) * (height - DEFAULT_HEIGHT - GAP_HEIGHT));
        const y = height - scaledBarHeight - DEFAULT_HEIGHT - GAP_HEIGHT;

        let colorColor = getLogProbToColor(binEdge).hex();
        let barColor;
        if (binEdge >= minValue && binEdge <= maxValue) {
          barColor = colorColor;
        } else {
          barColor = gray;
        }

        // Draw the main histogram bar
        ctx.fillStyle = barColor;
        ctx.fillRect(x, y, barWidth, scaledBarHeight);

        // Draw the color bar at the bottom
        ctx.fillStyle = colorColor;
        ctx.fillRect(x, height - DEFAULT_HEIGHT, barWidth, DEFAULT_HEIGHT);
      });
    }

    // Draw min and max lines
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;

    const minX = linearScale(minValue, hasData ? data.bin_edges[0] : defaultRange[0], hasData ? data.bin_edges[data.bin_edges.length - 1] : defaultRange[1], 0, width);
    const maxX = linearScale(maxValue, hasData ? data.bin_edges[0] : defaultRange[0], hasData ? data.bin_edges[data.bin_edges.length - 1] : defaultRange[1], 0, width);

    ctx.beginPath();
    ctx.moveTo(minX, 0);
    ctx.lineTo(minX, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(maxX, 0);
    ctx.lineTo(maxX, height);
    ctx.stroke();

    ctx.fillStyle = gray;
    let min = humanLog(minValue);
    let max = humanLog(maxValue);
    ctx.fillText(min, minX + 5, height - 5);
    ctx.fillText(max, maxX - 22, height - 5);
  };

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const minX = linearScale(minValue, hasData ? data.bin_edges[0] : defaultRange[0], hasData ? data.bin_edges[data.bin_edges.length - 1] : defaultRange[1], 0, canvas.width);
    const maxX = linearScale(maxValue, hasData ? data.bin_edges[0] : defaultRange[0], hasData ? data.bin_edges[data.bin_edges.length - 1] : defaultRange[1], 0, canvas.width);

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

      const range = hasData ? [data.bin_edges[0], data.bin_edges[data.bin_edges.length - 1]] : defaultRange;
      const newValue = inverseLinearScale(x, range[0], range[1], 0, canvas.width);

      if (isDraggingRef.current === 'min') {
        const updatedMin = Math.min(Math.max(range[0], newValue), maxValue);
        setMinValue(updatedMin);
      } else {
        const updatedMax = Math.max(Math.min(range[1], newValue), minValue);
        setMaxValue(updatedMax);
      }
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = null;
    onUpdate(minValue, maxValue);
  };

  return (
    <div className="histogram-container">
      <div className="histogram" ref={parentRef}>
        <canvas 
          ref={canvasRef}
          width={500} height={200}
          style={{ width: '100%', height: '100%' }}
          className="cursor-pointer"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        {/* <div>
          <span>Min: {minValue.toFixed(2)}</span>
          <span>Max: {maxValue.toFixed(2)}</span>
      </div> */}
      </div>
    </div>
  );
};
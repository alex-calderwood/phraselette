import { getUniqueID } from '../scripts/utils';
import { ChangeType, getTextIndexFromNode } from './TextChange';

/**
 * Represents a range with a start, end, and associated value.
 */
class Range {
    constructor(start, end, value, id=getUniqueID('range')) {
        this.start = start;
        this.end = end;
        this.value = value;
        this.id = id;
    }

    /**
     * @returns {Range} a copy (with the identical ID so be careful)
     **/
    copy() {
        let range = new Range(this.start, this.end, this.value, this.id);
        return range;
    }
}
  
/**
 * A data structure for managing ranges and their associated values.
 * Supports operations like setting, getting, updating, and querying ranges.
 */
export class RangeMap {
    constructor() {
        this.ranges = {};
    }

    set(start, end, value) {
        const existingRange = this.findExactRange(start, end);
        if (existingRange) {
            // Update the value of the existing range
            existingRange.value = value;
            return existingRange.id;
        }
        
        // Create a new range
        const id = getUniqueID('range');
        this.ranges[id] = new Range(start, end, value, id);
        return id;
    }

    findExactRange(start, end) {
        return Object.values(this.ranges).find(r => r.start === start && r.end === end);
    }

    get(start, end) {
        const range = this.findExactRange(start, end);
        return range ? range.value : undefined;
    }

    allRanges() {
        return Object.values(this.ranges);
    }

    findEnclosingRange(index) {
        return Object.values(this.ranges).find(r => r.start <= index && r.end >= index);
    }

    findRangeById(id) {
        return this.ranges[id];
    }

    updateRangeById(id, newStart, newEnd) {
        const range = this.ranges[id];
        if (range) {
            // Check if there's already a range with the new start/end
            const existingRange = this.findExactRange(newStart, newEnd);
            if (existingRange && existingRange.id !== id) {
                // If there is, update its value and remove the old range
                existingRange.value = range.value;
                delete this.ranges[id];
                return existingRange;
            }

            // Otherwise, update the current range
            range.start = newStart;
            range.end = newEnd;
            return range;
        }
        return null;
    }

    updateRanges(change) {
        console.log(`testing: Updating ranges for change:`, change);
      
        const updatedRanges = this.allRanges().map(range => {
          let updatedRange = range.copy();
          let updateType = 'unchanged';
          
          if (change.type === ChangeType.INSERT) {
            if (change.startIndex <= range.start) {
              // Insert before or at the start of the range
              updatedRange = this.updateRangeById(range.id, 
                range.start + change.text.length, range.end + change.text.length
              );
              updateType = 'shifted';
              console.log(`testing: shifted', Range ${range.id}:`, range.start, range.end, change.text, change.text.length);
            } else if (change.startIndex <= range.end) {
              // Insert within the range
              updatedRange = this.updateRangeById(range.id, 
                range.start, range.end + change.text.length
              );
              updateType = 'expanded';
            }
          } else if (change.type === ChangeType.DELETE) {
            const deleteLength = change.endIndex - change.startIndex;
            if (change.endIndex <= range.start) {
              // Delete before the range
              updatedRange = this.updateRangeById(range.id, 
                range.start - deleteLength, range.end - deleteLength
              );
              updateType = 'shifted';
            } else if (change.startIndex < range.start && change.endIndex < range.end) {
              // Delete partially overlapping the start of the range
              updatedRange = this.updateRangeById(range.id, 
                change.startIndex, range.end - (change.endIndex - range.start)
              );
              updateType = 'start trimmed';
            } else if (change.startIndex > range.start && change.endIndex >= range.end) {
              // Delete partially overlapping the end of the range
              updatedRange = this.updateRangeById(range.id, 
                range.start, change.startIndex
              );
              updateType = 'end trimmed';
            } else if (change.startIndex >= range.start && change.endIndex <= range.end) {
              // Delete completely within the range
              updatedRange = this.updateRangeById(range.id, 
                range.start, range.end - deleteLength
              );
              updateType = 'internally trimmed';
            } else if (change.startIndex <= range.start && change.endIndex >= range.end) {
              // Delete completely encompassing the range
              updatedRange = this.updateRangeById(range.id, 
                change.startIndex, change.startIndex
              );
              updateType = 'collapsed';
            }
          }
      
          if (updateType !== 'unchanged') {
            console.log(`testing: Range ${range.id} ${updateType}:`, 
              `[${range.start}, ${range.end}] -> [${updatedRange.start}, ${updatedRange.end}]`);
          }
      
          return updatedRange;
        });
      
        this.ranges = updatedRanges.reduce((acc, range) => {
            acc[range.id] = range;
            return acc;
        }, {});

        console.log(`testing: Updated ranges 1:`, updatedRanges);
        console.log(`testing: Updated ranges 2:`, this.ranges);
        return updatedRanges;
      }

    copy() {
        const newRangeMap = new RangeMap();
        Object.entries(this.ranges).forEach(([id, range]) => {
            newRangeMap.ranges[id] = range.copy();
        });
        return newRangeMap;
    }

    keys() {
        return Object.values(this.ranges).map(r => [r.start, r.end]);
    }
}
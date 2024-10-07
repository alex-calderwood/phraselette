import { getUniqueID } from "../scripts/utils";
import { ChangeType } from "./TextChange";

/**
 * Represents a range with a start, end, and associated value.
 */
class Range {
  constructor(start, end, value, id = getUniqueID("range")) {
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

  /*
   * Create a new opening or set the one that is there. 
   * WARNING this should be used with caution, because the opening, 
   * if it does exist might have moved. Only use when you are certain
   * you want to create a new opening at the [start, end] if it doesn't exist
   * otherwise, use setById().
  */
  set(start, end, value, ignoreWarnings = false) {
    if (
      start == null ||
      Number.isNaN(start) ||
      end == null ||
      Number.isNaN(end)
    ) {
      console.error(
        `range: invalid range: [${start}, ${end}] for value:`,
        value
      );
    }

    const existingRange = this.findExactRange(start, end);
    if (existingRange) {
      existingRange.value = value;
      return existingRange;
    }

    const id = getUniqueID("range");
    this.ranges[id] = new Range(start, end, value, id);
    if (!ignoreWarnings) {
      console.warn(
        `range: created new range: [${start}, ${end}] for value:`,
        value
      );
    }
    return this.ranges[id];
  }

  setById(id, value) {
    const range = this.ranges[id];
    if (range) {
      range.value = value;
      return range;
    }
    console.error(`range: setById could not find range with id:`, id);
    return null;
  }

  findExactRange(start, end) {
    return Object.values(this.ranges).find(
      (r) => r.start === start && r.end === end
    );
  }

  get(start, end) {
    const range = this.findExactRange(start, end);
    return range ? range.value : undefined;
  }

  allRanges() {
    return Object.values(this.ranges);
  }

  findEnclosingRange(index) {
    return Object.values(this.ranges).find(
      (r) => r.start <= index && r.end >= index
    );
  }

  findRangeById(id) {
    return this.ranges[id];
  }

  updateRangeById(id, newStart, newEnd) {
    const range = this.ranges[id];
    if (range) {
      // Always update the current range, though there might now be two at that location
      range.start = newStart;
      range.end = newEnd;
      return range;
    }
    console.error(`range: updateRangeById could not find range with id:`, id);
    return null;
  }

  updateRanges(change) {
    this.allRanges().forEach(range => {
      const originalRange = range.copy();
      let updateType = "unchanged";
      console.log("range:", 'change range at', change.startIndex, change.endIndex, 'range range', range.start, range.end);
  
      if (change.type === ChangeType.INSERT) {
        updateType = this._handleInsert(change, range);
      } else if (change.type === ChangeType.DELETE) {
        updateType = this._handleDelete(change, range);
      } else {
        throw new Error(`range: unsupported change type:`, change.type);
      }
  
      if (updateType !== "unchanged") {
        console.log(
          `range: range ${originalRange.id} ${updateType}:`,
          `[${originalRange.start}, ${originalRange.end}] -> [${range.start}, ${range.end}]`
        );
      }
    });
  
  }

  _handleDelete(change, range) {
    const deleteLength = change.length;
    let updateType = "unchanged";
  
    if (change.endIndex <= range.start) {
      updateType = "shifted";
      this.updateRangeById(range.id, range.start - deleteLength, range.end - deleteLength);
    } 
    else if (change.startIndex <= range.end && change.endIndex >= range.start) {
      updateType = "trimmed";

      let newStart = range.start;
      let newEnd = range.end;
    
      // Adjust newStart if deletion overlaps the start of the range
      if (change.startIndex <= range.start) {
        newStart = change.endIndex + 1 - deleteLength;
      }
    
      // Adjust newEnd if deletion overlaps the end of the range
      if (change.endIndex >= range.end) {
        newEnd = change.startIndex - 1;
      } else {
        newEnd = range.end - deleteLength;
      }
    
      // If the range is invalid after adjustment, remove it
      if (newStart > newEnd) {
        updateType = "collapsed";
        delete this.ranges[range.id];
      } else {
        this.updateRangeById(range.id, newStart, newEnd);
      }
    }
    return updateType;
  }

  _handleInsert(change, range) {
    let updateType = "unchanged";
    let insertLength = change.length;
  
    if (change.startIndex <= range.start) {
      updateType = "shifted";
      this.updateRangeById(range.id, range.start + insertLength, range.end + insertLength);
    } else if (change.startIndex <= range.end) {
      updateType = "expanded";
      this.updateRangeById(range.id, range.start, range.end + insertLength);
    }
  
    return updateType;
  }

  copy() {
    const newRangeMap = new RangeMap();
    Object.entries(this.ranges).forEach(([id, range]) => {
      newRangeMap.ranges[id] = range.copy();
    });
    return newRangeMap;
  }

  keys() {
    return Object.values(this.ranges).map((r) => [r.start, r.end]);
  }
}

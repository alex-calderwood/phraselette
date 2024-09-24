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

  set(start, end, value) {
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
    return this.ranges[id];
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
    console.error(`range: could not find range with id:`, id);
    return null;
  }

  updateRanges(change) {
    console.log(`range: updating ranges for change:`, change);
  
    this.allRanges().forEach(range => {
      const originalRange = range.copy();
      let updateType = "unchanged";
  
      console.log("range:", 'change range', change.startIndex, change.endIndex, 'range range', range.start, range.end);
  
      if (change.type === ChangeType.INSERT) {
        updateType = this._handleInsert(change, range);
      } else if (change.type === ChangeType.DELETE) {
        updateType = this._handleDelete(change, range);
      } else if (change.type === ChangeType.REPLACE) {
        const deleteType = this._handleDelete(change, range);
        const insertType = this._handleInsert(change, range);
        updateType = deleteType !== 'unchanged' && insertType !== 'unchanged' 
          ? `${deleteType}-${insertType}` 
          : insertType !== 'unchanged' ? insertType : deleteType;
      }
  
      if (updateType !== "unchanged") {
        console.log(
          `range: range ${originalRange.id} ${updateType}:`,
          `[${originalRange.start}, ${originalRange.end}] -> [${range.start}, ${range.end}]`
        );
      }
    });
  
    console.log(`testing: updated ranges:`, this.ranges);
  }

  _handleDelete(change, range) {
    const deleteLength = change.endIndex - change.startIndex;
    let updateType = "unchanged";
  
    if (change.endIndex <= range.start) {
      updateType = "shifted";
      this.updateRangeById(range.id, range.start - deleteLength, range.end - deleteLength);
    } else if (change.startIndex < range.end && change.endIndex > range.start) {
      updateType = "trimmed";
      const newStart = Math.max(range.start, change.startIndex);
      const newEnd = Math.min(range.end, change.startIndex) + Math.max(0, range.end - change.endIndex);
      this.updateRangeById(range.id, newStart, newEnd);
    } else if (
      change.startIndex <= range.start &&
      change.endIndex >= range.end
    ) {
      updateType = "collapsed"; // Delete the entire range
      updatedRange = this.updateRangeById(range.id, change.startIndex, change.startIndex);
    }
    return { updatedRange, updateType };
  }

  _handleInsert(change, range) {
    let updateType = "unchanged";
  
    if (change.startIndex <= range.start) {
      this.updateRangeById(range.id, range.start + change.text.length, range.end + change.text.length);
      updateType = "shifted";
    } else if (change.startIndex <= range.end) {
      this.updateRangeById(range.id, range.start, range.end + change.text.length);
      updateType = "expanded";
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

import * as assert from "assert";
import { IInterval, IntervalTree } from "../collections";

class TestInterval implements IInterval {
    constructor(
        public start: number,
        public end: number) { }

    public clone() {
        return new TestInterval(this.start, this.end);
    }

    public compare(b: TestInterval) {
        const startResult = this.start - b.start;
        if (startResult === 0) {
            return (this.end - b.end);
        } else {
            return startResult;
        }
    }

    public overlaps(b: TestInterval) {
        const result = (this.start < b.end) &&
            (this.end >= b.start);
        return result;
    }

    public union(b: TestInterval) {
        return new TestInterval(Math.min(this.start, b.start),
            Math.max(this.end, b.end));
    }
}

describe("Collections.IntervalTree", () => {
    let intervalTree: IntervalTree<IInterval>;

    beforeEach(() => {
       intervalTree = new IntervalTree<IInterval>();
    });

    describe(".map", () => {
        it("Should run each node through the given function", () => {
            intervalTree.put(new TestInterval(1, 5));
            intervalTree.put(new TestInterval(4, 8));
            intervalTree.put(new TestInterval(1, 10));

            let range1Pass = false;
            let range2Pass = false;
            let range3Pass = false;

            const map = (interval: TestInterval) => {
                if (interval.start === 1 && interval.end === 5) {
                    range1Pass = true;
                } else if (interval.start === 4 && interval.end === 8) {
                    range2Pass = true;
                } else if (interval.start === 1 && interval.end === 10) {
                    range3Pass = true;
                }
                return true;
            };

            intervalTree.map(map);

            const fullWalk = range1Pass && range2Pass && range3Pass;
            assert.equal(fullWalk, true, "Full walk of the interval tree did not occur");
        });
    });
});

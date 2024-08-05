/* 
 * Score each prediction based on all available constraints. 
 * TODO determine if we want to allow predictions to 
 * a.) be of any token type
 * b.) resolve them to words earlier
 * c.) resolve them to words here
 * d.) ignore them if they are not words
*/
export async function resolveConstraints(predictions, constraints, sort=true, comparator='total', sortByAttribute=false) {
    const postConstraints = constraints.filter((constraint) => { return !constraint.isPre; });

    let filtered = [];
    for (let sequence of predictions) {
        let sequenceTotal = 0;
        let reject = false;
        for (let constraint of postConstraints) {
            if (constraint.applies(sequence)) {
                const score = await constraint.getScore(sequence, document);
                sequence.scores[constraint.name] = {'value': score, 'constraint': constraint};
                sequenceTotal += score;

                if (!constraint.evaluate(score)) { reject = true;}
            }
        }
        sequence.scores['total'] = {'value': sequenceTotal, 'constraint': null}
        if (!reject) { filtered.push(sequence); }
    }

    if (sort) {
        filtered = sortPredictions(filtered, comparator, sortByAttribute);
    }
    return filtered;
}

// todo
export function sortPredictions(scoredPredictions, comparator, sortByAttribute) {
    let sortedPredictions = scoredPredictions.sort((a, b) => {
        if (sortByAttribute) {
            // console.log('comparator', comparator, 'by attribute', a, b, a.getAttribute(comparator), b.getAttribute(comparator));
            let aScore = a.getAttribute(comparator);
            let bScore = b.getAttribute(comparator);
            return bScore - aScore;
        }
        // console.log('comparator', comparator, 'by score', a.scores[comparator].value, b.scores[comparator].value);
        return b.scores[comparator].value - a.scores[comparator].value;
    });

    return sortedPredictions;
}
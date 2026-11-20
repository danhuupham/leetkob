# Position lookup with binary search

You are given `n` distinct integers in increasing order and `q` queries. For each query `x`,
print the position of `x` in the array (positions start at 1), or `-1` if `x` is not in it.

## Input
- Line 1: `n` (1 ≤ n ≤ 1000).
- Line 2: `n` distinct integers in increasing order (|a_i| ≤ 10^9).
- Line 3: `q` (1 ≤ q ≤ 1000).
- Line 4: `q` integers `x` (|x| ≤ 10^9).

## Output
`q` lines, the answer to each query.

## Example
Input
```
5
-10 -3 0 4 100
6
-10 100 0 5 -11 4
```
Output
```
1
5
3
-1
-1
4
```

## Limits
Time limit: 2 seconds. Memory limit: 256 MB. Compiled with `g++ -std=c++17 -O2`.

## Constraints
The lab constraints and their deductions are in `constraints.json`. A submission is Accepted when it passes every test; the constraints are checked separately, before grades are published.

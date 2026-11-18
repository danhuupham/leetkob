# GCD and LCM with Euclid

For each pair of positive integers, print their greatest common divisor and least common
multiple.

## Input
- Line 1: `q` (1 ≤ q ≤ 200).
- Next `q` lines: two integers `a b` (1 ≤ a, b ≤ 10^6).

## Output
`q` lines: `gcd(a, b)` and `lcm(a, b)` separated by a space.

## Example
Input
```
3
12 18
7 7
1 1000000
```
Output
```
6 36
7 7
1 1000000
```

## Limits
Time limit: 2 seconds. Memory limit: 256 MB. Compiled with `g++ -std=c++17 -O2`.

## Constraints
The lab constraints and their deductions are in `constraints.json`. A submission is Accepted when it passes every test; the constraints are checked separately, before grades are published.

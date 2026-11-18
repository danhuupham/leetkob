# A growable array without std::vector

Read integers until the end of the input (the count is not given in advance). Print how many
integers were read, then print them in reverse order. The point of the lab is to manage the
memory yourself.

## Input
Between 0 and 100 000 integers (|x| ≤ 10^9), separated by spaces and/or newlines, until end of
file.

## Output
- Line 1: the number of integers `k`.
- Line 2: the `k` integers in reverse order, separated by spaces (an empty line when `k = 0`).

## Example
Input
```
3 -1 4 1 -5 9 2 6
```
Output
```
8
6 2 9 -5 1 4 -1 3
```

## Limits
Time limit: 2 seconds. Memory limit: 256 MB. Compiled with `g++ -std=c++17 -O2`.

## Constraints
The lab constraints and their deductions are in `constraints.json`. A submission is Accepted when it passes every test; the constraints are checked separately, before grades are published.

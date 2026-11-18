#include <bits/stdc++.h>
using namespace std;
#define FOR(i, a, b) for (int i = (a); i < (b); ++i)

int n, a[1005];
long long s;

void solve(int depth) {
    if (depth == 0) {
        FOR(i, 0, n) { cin >> a[i]; s += a[i]; }
        return;
    }
    solve(depth - 1);
}

void printRev(int i) {
    if (i < 0) return;
    cout << a[i] << " ";
    printRev(i - 1);
}

int main() {
    cin >> n;
    solve(1);
    printRev(n - 1);
    cout << "\n" << s << "\n";
    return 0;
}

#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int& x : a) cin >> x;
    int q;
    cin >> q;
    while (q--) {
        int x;
        cin >> x;
        auto it = lower_bound(a.begin(), a.end(), x);
        if (it != a.end() && *it == x) cout << it - a.begin() + 1 << '\n';
        else cout << -1 << '\n';
    }
}

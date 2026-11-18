#include <iostream>
#include <vector>
using namespace std;

int nhiPhan(const vector<long long>& a, int l, int r, long long x) {
    if (l > r) return -1;
    int mid = (l + r) / 2;
    if (a[mid] == x) return mid + 1;
    if (a[l] == x) return l + 1;
    return nhiPhan(a, l + 1, r, x);
}

int main() {
    int n, q;
    cin >> n;
    vector<long long> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];
    cin >> q;
    while (q--) {
        long long x;
        cin >> x;
        cout << nhiPhan(a, 0, n - 1, x) << "\n";
    }
    return 0;
}

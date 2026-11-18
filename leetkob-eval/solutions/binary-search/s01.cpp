#include <iostream>
using namespace std;

int a[1005];

int main() {
    int n, q;
    cin >> n;
    for (int i = 1; i <= n; i++) cin >> a[i];
    cin >> q;
    while (q--) {
        int x;
        cin >> x;
        int lo = 1, hi = n, ans = -1;
        while (lo <= hi) {
            int mid = (lo + hi) / 2;
            if (a[mid] == x) { ans = mid; break; }
            if (a[mid] < x) lo = mid + 1;
            else hi = mid - 1;
        }
        cout << ans << "\n";
    }
    return 0;
}

#include <iostream>
using namespace std;

int binarySearch(int a[], int n, int x) {
    int lo = 0, hi = n - 1;
    while (lo <= hi) {
        if (a[lo] == x) return lo + 1;
        lo++;
    }
    return -1;
}

int main() {
    int n;
    cin >> n;
    int a[1005];
    for (int i = 0; i < n; i++) cin >> a[i];
    int q;
    cin >> q;
    for (int i = 0; i < q; i++) {
        int x;
        cin >> x;
        cout << binarySearch(a, n, x) << endl;
    }
    return 0;
}

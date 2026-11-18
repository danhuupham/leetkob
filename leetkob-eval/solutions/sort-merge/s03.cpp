#include <iostream>
using namespace std;

// de bai cam dung std::sort nen tu viet ham sort rieng
namespace my {
    int buf[5005];

    void sort(int* a, int lo, int hi) {   // sap xep doan [lo, hi)
        if (hi - lo < 2) return;
        int mid = (lo + hi) / 2;
        sort(a, lo, mid);
        sort(a, mid, hi);
        int i = lo, j = mid, k = 0;
        while (i < mid || j < hi) {
            if (j >= hi || (i < mid && a[i] <= a[j])) buf[k++] = a[i++];
            else buf[k++] = a[j++];
        }
        for (int t = 0; t < k; t++) a[lo + t] = buf[t];
    }
}

int a[5005];

int main() {
    int n;
    cin >> n;
    for (int i = 0; i < n; i++) cin >> a[i];
    my::sort(a, 0, n);
    for (int i = 0; i < n; i++) cout << a[i] << ' ';
    cout << '\n';
    return 0;
}

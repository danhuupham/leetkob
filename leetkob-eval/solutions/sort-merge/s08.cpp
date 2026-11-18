#include <bits/stdc++.h>
#define ll long long
#define all(v) (v).begin(), (v).end()
#define SORT(v) std::sort(all(v))
using namespace std;

void mergeSort(vector<ll>& v, int l, int r) {
    if (r - l <= 1) return;
    int m = (l + r) / 2;
    mergeSort(v, l, m);
    mergeSort(v, m, r);
    vector<ll> t;
    int i = l, j = m;
    while (i < m && j < r) t.push_back(v[i] <= v[j] ? v[i++] : v[j++]);
    while (i < m) t.push_back(v[i++]);
    while (j < r) t.push_back(v[j++]);
    for (int k = l; k < r; k++) v[k] = t[k - l];
}

int main() {
    int n;
    cin >> n;
    vector<ll> v(n);
    for (auto& x : v) cin >> x;
    SORT(v);
    for (auto x : v) cout << x << " ";
    cout << "\n";
}

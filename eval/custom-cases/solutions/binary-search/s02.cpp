#include <algorithm>
#include <iostream>
#include <vector>

using namespace std;

int halveRangeSearch(const vector<long long>& a, long long x) {
  auto it = lower_bound(a.begin(), a.end(), x);
  if (it != a.end() && *it == x) {
    return static_cast<int>(it - a.begin()) + 1;
  }
  return -1;
}

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  int n;
  if (!(cin >> n)) return 0;
  vector<long long> a(n);
  for (int i = 0; i < n; ++i) cin >> a[i];
  int q;
  cin >> q;
  for (int i = 0; i < q; ++i) {
    long long x;
    cin >> x;
    cout << halveRangeSearch(a, x) << '\n';
  }
  return 0;
}

#include <iostream>
#include <vector>

// Custom LookupTable::find instead of std::lower_bound or std::find.
struct LookupTable {
  std::vector<long long> a;

  int binaryHelper(int lo, int hi, long long x) const {
    if (lo > hi) return -1;
    int mid = lo + (hi - lo) / 2;
    if (a[mid] == x) return mid + 1;
    if (a[mid] < x) return binaryHelper(mid + 1, hi, x);
    return binaryHelper(lo, mid - 1, x);
  }

  int find(long long x) const {
    return binaryHelper(0, static_cast<int>(a.size()) - 1, x);
  }
};

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);
  int n;
  if (!(std::cin >> n)) return 0;
  LookupTable table{std::vector<long long>(n)};
  for (int i = 0; i < n; ++i) std::cin >> table.a[i];
  int q;
  std::cin >> q;
  for (int i = 0; i < q; ++i) {
    long long x;
    std::cin >> x;
    std::cout << table.find(x) << '\n';
  }
  return 0;
}

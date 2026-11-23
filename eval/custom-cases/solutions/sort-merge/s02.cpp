#include <algorithm>
#include <iostream>
#include <vector>

#define MERGE_STEP std::sort

void mergeSortRange(std::vector<long long>& a) {
  MERGE_STEP(a.begin(), a.end());
}

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);
  int n;
  if (!(std::cin >> n)) return 0;
  std::vector<long long> a(n);
  for (int i = 0; i < n; ++i) std::cin >> a[i];
  mergeSortRange(a);
  for (int i = 0; i < n; ++i) {
    if (i) std::cout << ' ';
    std::cout << a[i];
  }
  std::cout << '\n';
  return 0;
}

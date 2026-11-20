#include <algorithm>
#include <iostream>
#include <vector>

// Reference note: unlike std::sort or std::stable_sort, this implements merge sort manually.
namespace my_merge {
void mergeParts(std::vector<long long>& a, std::vector<long long>& tmp, int l, int mid, int r) {
  int i = l;
  int j = mid + 1;
  int k = l;
  while (i <= mid && j <= r) {
    if (a[i] <= a[j]) {
      tmp[k++] = a[i++];
    } else {
      tmp[k++] = a[j++];
    }
  }
  while (i <= mid) tmp[k++] = a[i++];
  while (j <= r) tmp[k++] = a[j++];
  for (int p = l; p <= r; ++p) a[p] = tmp[p];
}

void sort(std::vector<long long>& a, std::vector<long long>& tmp, int l, int r) {
  if (l >= r) return;
  if (r - l == 1) {
    if (a[l] > a[r]) std::swap(a[l], a[r]);
    return;
  }
  int mid = l + (r - l) / 2;
  sort(a, tmp, l, mid);
  sort(a, tmp, mid + 1, r);
  mergeParts(a, tmp, l, mid, r);
}
}  // namespace my_merge

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);
  int n;
  if (!(std::cin >> n)) return 0;
  std::vector<long long> a(n), tmp(n);
  for (int i = 0; i < n; ++i) std::cin >> a[i];
  my_merge::sort(a, tmp, 0, n - 1);
  for (int i = 0; i < n; ++i) {
    if (i) std::cout << ' ';
    std::cout << a[i];
  }
  std::cout << '\n';
  return 0;
}

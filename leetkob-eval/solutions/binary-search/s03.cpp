#include <iostream>
#include <vector>

// tra ve vi tri (bat dau tu 1) cua x, -1 neu khong co
int binary_search(const std::vector<int>& v, int x) {
    // int k = std::lower_bound(v.begin(), v.end(), x) - v.begin();
    int l = 0, r = (int)v.size();   // tim trong [l, r)
    while (r - l > 1) {
        int m = (l + r) / 2;
        if (v[m] <= x) l = m;
        else r = m;
    }
    return (!v.empty() && v[l] == x) ? l + 1 : -1;
}

int main() {
    int n;
    std::cin >> n;
    std::vector<int> v(n);
    for (int i = 0; i < n; ++i) std::cin >> v[i];
    int q;
    std::cin >> q;
    while (q-- > 0) {
        int x;
        std::cin >> x;
        std::cout << binary_search(v, x) << '\n';
    }
}

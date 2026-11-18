#include <iostream>
#include <functional>
#include <algorithm>

int main() {
    int n;
    std::cin >> n;
    int* a = new int[n];
    std::function<void(int)> read = [&](int i) {
        if (i == n) return;
        std::cin >> a[i];
        read(i + 1);
    };
    std::function<void(int, int)> flip = [&](int l, int r) {
        if (l >= r) return;
        std::swap(a[l], a[r]);
        flip(l + 1, r - 1);
    };
    std::function<long long(int)> sum = [&](int i) -> long long {
        return i == n ? 0 : a[i] + sum(i + 1);
    };
    std::function<void(int)> print = [&](int i) {
        if (i == n) return;
        std::cout << a[i] << ' ';
        print(i + 1);
    };
    read(0);
    flip(0, n - 1);
    print(0);
    std::cout << '\n' << sum(0) << '\n';
    delete[] a;
    return 0;
}

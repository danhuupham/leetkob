#include <iostream>
#include <numeric>

long long euclid(long long a, long long b) {
    long long l = std::lcm(a, b);
    return a / (l / b);
}

int main() {
    int q;
    std::cin >> q;
    while (q--) {
        long long a, b;
        std::cin >> a >> b;
        long long g = euclid(a, b);
        std::cout << g << " " << a / g * b << "\n";
    }
    return 0;
}

#include <iostream>
#include <algorithm>
using namespace std;

int euclid(int a, int b) {
    for (int d = min(a, b); d >= 1; d--)
        if (a % d == 0 && b % d == 0) return d;
    return 1;
}

int main() {
    int q;
    cin >> q;
    while (q--) {
        int a, b;
        cin >> a >> b;
        int g = euclid(a, b);
        cout << g << " " << 1LL * a / g * b << "\n";
    }
    return 0;
}

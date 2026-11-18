#include <iostream>
using namespace std;

int a[1005];
int n;

void nhap(int i) {
    if (i == n) return;
    cin >> a[i];
    nhap(i + 1);
}

void inNguoc(int i) {
    if (i < 0) return;
    cout << a[i] << " ";
    inNguoc(i - 1);
}

long long tong(int i) {
    if (i == n) return 0;
    return a[i] + tong(i + 1);
}

int main() {
    cin >> n;
    nhap(0);
    inNguoc(n - 1);
    cout << "\n" << tong(0) << "\n";
    return 0;
}

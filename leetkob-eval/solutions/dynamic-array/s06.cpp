#include <iostream>
using namespace std;

const int MAX_N = 100000;

int main() {
    int capacity = MAX_N;
    int* a = new int[capacity];
    int size = 0, x;
    while (cin >> x) {
        a[size++] = x;
    }
    cout << size << "\n";
    for (int i = size - 1; i >= 0; i--) cout << a[i] << " ";
    cout << "\n";
    delete[] a;
    return 0;
}

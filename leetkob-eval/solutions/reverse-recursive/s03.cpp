#include <iostream>
#include <string>
using namespace std;

// bai nay khong duoc dung for/while
int data_[1005];
int n;
long long total = 0;

void readOdd(int i);

void readEven(int i) {
    if (i >= n) return;
    cin >> data_[i];
    total += data_[i];
    readOdd(i + 1);
}

void readOdd(int i) {
    if (i >= n) return;
    cin >> data_[i];
    total += data_[i];
    readEven(i + 1);
}

string formatBackward(int i) {
    if (i < 0) return "";
    return to_string(data_[i]) + " " + formatBackward(i - 1);
}

int main() {
    cin >> n;
    readEven(0);
    cout << formatBackward(n - 1) << endl;
    cout << total << endl;
    return 0;
}
